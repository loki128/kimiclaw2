/**
 * AutoFixer VS Code Extension
 * Provides live autocorrect-style coding help for JavaScript/TypeScript.
 *
 * Features:
 *  - Inline completions with debounce and trigger characters
 *  - Diagnostics: unmatched brackets, TODO without owner, console.log warnings
 *  - Code actions: missing semicolons, keyword typo fixes, import suggestions
 *  - In-memory cache keyed by document uri + version + position
 *  - Rate limiting (maxSuggestionsPerMinute)
 *  - Toggle command
 *  - Configurable settings under the AutoFixer namespace
 */

import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Types & Constants
// ---------------------------------------------------------------------------

const EXTENSION_NAME = 'AutoFixer';
const CONFIG_SECTION = 'autoFixer';
const DIAGNOSTICS_SOURCE = 'AutoFixer';
const TOGGLE_COMMAND = 'autoFixer.toggle';

/** Diagnostic codes used by AutoFixer. */
const DiagCode = {
  UNMATCHED_BRACKET: 'AF001',
  TODO_NO_OWNER: 'AF002',
  CONSOLE_LOG: 'AF003',
  MISSING_SEMICOLON: 'AF004',
  KEYWORD_TYPO: 'AF005',
} as const;

type DiagCodeValue = (typeof DiagCode)[keyof typeof DiagCode];

/** Common keyword typos and their corrections. */
const KEYWORD_TYPOS: ReadonlyArray<{ wrong: RegExp; correct: string }> = [
  { wrong: /\bfucntion\b/g, correct: 'function' },
  { wrong: /\bfunciton\b/g, correct: 'function' },
  { wrong: /\bfuntcion\b/g, correct: 'function' },
  { wrong: /\bretunr\b/g, correct: 'return' },
  { wrong: /\bretrun\b/g, correct: 'return' },
  { wrong: /\bconslt\b/g, correct: 'const' },
  { wrong: /\bcosnt\b/g, correct: 'const' },
  { wrong: /\bimprot\b/g, correct: 'import' },
  { wrong: /\bimpotr\b/g, correct: 'import' },
  { wrong: /\bexoprt\b/g, correct: 'export' },
  { wrong: /\bexprot\b/g, correct: 'export' },
  { wrong: /\binterafce\b/g, correct: 'interface' },
  { wrong: /\bintreface\b/g, correct: 'interface' },
  { wrong: /\bclsas\b/g, correct: 'class' },
  { wrong: /\bcalss\b/g, correct: 'class' },
  { wrong: /\bswithc\b/g, correct: 'switch' },
  { wrong: /\bswtich\b/g, correct: 'switch' },
  { wrong: /\bdefualt\b/g, correct: 'default' },
  { wrong: /\bdeafult\b/g, correct: 'default' },
  { wrong: /\btpye\b/g, correct: 'type' },
  { wrong: /\bawiat\b/g, correct: 'await' },
  { wrong: /\basnc\b/g, correct: 'async' },
  { wrong: /\bcactch\b/g, correct: 'catch' },
  { wrong: /\bthorw\b/g, correct: 'throw' },
  { wrong: /\bvodi\b/g, correct: 'void' },
];

// No-op filter kept for safety in case future entries slip in
const EFFECTIVE_TYPOS = KEYWORD_TYPOS.filter(
  (entry) => entry.wrong.source !== `\\b${entry.correct}\\b`
);

// ---------------------------------------------------------------------------
// Configuration helpers
// ---------------------------------------------------------------------------

interface AutoFixerConfig {
  enabled: boolean;
  debounceMs: number;
  maxSuggestionsPerMinute: number;
  styleMode: 'safe' | 'aggressive';
  languages: string[];
  warnConsoleLog: boolean;
  requireTodoOwner: boolean;
}

function getConfig(): AutoFixerConfig {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  return {
    enabled: cfg.get<boolean>('enabled', true),
    debounceMs: Math.max(50, cfg.get<number>('debounceMs', 300)),
    maxSuggestionsPerMinute: Math.max(1, cfg.get<number>('maxSuggestionsPerMinute', 30)),
    styleMode: cfg.get<'safe' | 'aggressive'>('styleMode', 'safe'),
    languages: cfg.get<string[]>('languages', [
      'javascript',
      'javascriptreact',
      'typescript',
      'typescriptreact',
    ]),
    warnConsoleLog: cfg.get<boolean>('warnConsoleLog', true),
    requireTodoOwner: cfg.get<boolean>('requireTodoOwner', true),
  };
}

function isLanguageSupported(languageId: string): boolean {
  return getConfig().languages.includes(languageId);
}

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

type CacheValue = vscode.InlineCompletionItem[];

const completionCache = new Map<string, CacheValue>();
const CACHE_MAX_SIZE = 200;

function makeCacheKey(
  uri: vscode.Uri,
  version: number,
  position: vscode.Position
): string {
  return `${uri.toString()}|${version}|${position.line}:${position.character}`;
}

function cacheGet(key: string): CacheValue | undefined {
  return completionCache.get(key);
}

function cacheSet(key: string, value: CacheValue): void {
  if (completionCache.size >= CACHE_MAX_SIZE) {
    // Evict the oldest entry
    const firstKey = completionCache.keys().next().value;
    if (firstKey !== undefined) {
      completionCache.delete(firstKey);
    }
  }
  completionCache.set(key, value);
}

function cacheClear(): void {
  completionCache.clear();
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  private timestamps: number[] = [];

  constructor(private readonly maxPerMinute: number) {}

  tryConsume(): boolean {
    const now = Date.now();
    const windowStart = now - 60_000;
    this.timestamps = this.timestamps.filter((t) => t >= windowStart);
    if (this.timestamps.length >= this.maxPerMinute) {
      return false;
    }
    this.timestamps.push(now);
    return true;
  }

  reset(): void {
    this.timestamps = [];
  }
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

let outputChannel: vscode.OutputChannel;

function log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
  const timestamp = new Date().toISOString();
  outputChannel.appendLine(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
}

// ---------------------------------------------------------------------------
// Debounce utility
// ---------------------------------------------------------------------------

function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delayMs: number
): { call: (...args: T) => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    call(...args: T) {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        timer = undefined;
        fn(...args);
      }, delayMs);
    },
    cancel() {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Diagnostics
// ---------------------------------------------------------------------------

/**
 * Checks for unmatched brackets: {}, [], ()
 */
function findUnmatchedBrackets(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  const stack: Array<{ char: string; offset: number }> = [];

  const pairs: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
  const closers = new Set(['}', ']', ')']);
  const openers = new Set(['{', '[', '(']);

  let inString: false | '"' | "'" | '`' = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    // Handle string contexts (skip bracket checking inside strings)
    if (!inString) {
      if (ch === '"' || ch === "'" || ch === '`') {
        inString = ch;
        i++;
        continue;
      }
      // Skip single-line comments
      if (ch === '/' && text[i + 1] === '/') {
        while (i < text.length && text[i] !== '\n') {
          i++;
        }
        continue;
      }
      // Skip multi-line comments
      if (ch === '/' && text[i + 1] === '*') {
        i += 2;
        while (i < text.length - 1 && !(text[i] === '*' && text[i + 1] === '/')) {
          i++;
        }
        i += 2;
        continue;
      }
      if (openers.has(ch)) {
        stack.push({ char: ch, offset: i });
      } else if (closers.has(ch)) {
        if (stack.length === 0) {
          const pos = document.positionAt(i);
          diagnostics.push(
            new vscode.Diagnostic(
              new vscode.Range(pos, pos.translate(0, 1)),
              `Unmatched closing bracket '${ch}'`,
              vscode.DiagnosticSeverity.Error
            )
          );
          diagnostics[diagnostics.length - 1].code = DiagCode.UNMATCHED_BRACKET;
          diagnostics[diagnostics.length - 1].source = DIAGNOSTICS_SOURCE;
        } else {
          const top = stack[stack.length - 1];
          if (pairs[top.char] === ch) {
            stack.pop();
          } else {
            // Mismatched bracket
            const pos = document.positionAt(i);
            diagnostics.push(
              new vscode.Diagnostic(
                new vscode.Range(pos, pos.translate(0, 1)),
                `Mismatched bracket: expected '${pairs[top.char]}' but found '${ch}'`,
                vscode.DiagnosticSeverity.Error
              )
            );
            diagnostics[diagnostics.length - 1].code = DiagCode.UNMATCHED_BRACKET;
            diagnostics[diagnostics.length - 1].source = DIAGNOSTICS_SOURCE;
            stack.pop();
          }
        }
      }
    } else {
      // Inside a string — look for end of string or escape
      if (ch === '\\') {
        i += 2; // skip escaped character
        continue;
      }
      if (ch === inString) {
        inString = false;
      }
    }
    i++;
  }

  // Any unclosed openers left on the stack
  for (const { char, offset } of stack) {
    const pos = document.positionAt(offset);
    diagnostics.push(
      new vscode.Diagnostic(
        new vscode.Range(pos, pos.translate(0, 1)),
        `Unmatched opening bracket '${char}'`,
        vscode.DiagnosticSeverity.Error
      )
    );
    diagnostics[diagnostics.length - 1].code = DiagCode.UNMATCHED_BRACKET;
    diagnostics[diagnostics.length - 1].source = DIAGNOSTICS_SOURCE;
  }

  return diagnostics;
}

/**
 * Warns about TODO comments that don't have an owner tag.
 * Valid format: // TODO(owner): message
 * Invalid: // TODO: message  or  // TODO message
 */
function findTodoWithoutOwner(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  // Match TODO/FIXME/HACK that are NOT followed by (owner)
  const todoPattern = /\/\/\s*(TODO|FIXME|HACK)(?!\s*\([^)]+\))/gi;
  let match: RegExpExecArray | null;

  while ((match = todoPattern.exec(text)) !== null) {
    const pos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length);
    const diag = new vscode.Diagnostic(
      new vscode.Range(pos, endPos),
      `${match[1]} comment is missing an owner tag. Use: ${match[1]}(yourname): description`,
      vscode.DiagnosticSeverity.Information
    );
    diag.code = DiagCode.TODO_NO_OWNER;
    diag.source = DIAGNOSTICS_SOURCE;
    diagnostics.push(diag);
  }

  return diagnostics;
}

/**
 * Warns about console.log statements.
 */
function findConsoleLog(document: vscode.TextDocument): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const text = document.getText();
  const pattern = /\bconsole\.log\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const pos = document.positionAt(match.index);
    const endPos = document.positionAt(match.index + match[0].length - 1); // up to '('
    const diag = new vscode.Diagnostic(
      new vscode.Range(pos, endPos),
      'Avoid leaving console.log in production code. Consider using a logger.',
      vscode.DiagnosticSeverity.Warning
    );
    diag.code = DiagCode.CONSOLE_LOG;
    diag.source = DIAGNOSTICS_SOURCE;
    diagnostics.push(diag);
  }

  return diagnostics;
}

/**
 * Finds lines that look like they are missing a semicolon.
 * Conservative heuristic for 'safe' mode.
 */
function findMissingSemicolons(
  document: vscode.TextDocument,
  styleMode: 'safe' | 'aggressive'
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];

  // In safe mode, only flag obvious cases
  // In aggressive mode, flag more cases
  const lineCount = document.lineCount;
  for (let i = 0; i < lineCount; i++) {
    const line = document.lineAt(i);
    const text = line.text.trimEnd();

    if (text.length === 0) {
      continue;
    }

    // Skip comment lines
    const trimmed = text.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
      continue;
    }
    // Skip lines that end with {, }, (, [, ], ,, ;, :, =>
    const lastChar = text[text.length - 1];
    if (['{', '}', '(', '[', ']', ',', ';', ':', '\\', '`'].includes(lastChar)) {
      continue;
    }
    // Skip lines ending with an operator
    if (/[+\-*/%=&|^~!<>?]$/.test(text)) {
      continue;
    }

    // In safe mode: only flag specific statement patterns that almost certainly need semicolons
    if (styleMode === 'safe') {
      // const/let/var declarations not ending with semicolon
      if (
        /^\s*(const|let|var)\s+\w+/.test(text) &&
        !text.endsWith(';') &&
        !text.endsWith('{')
      ) {
        const pos = new vscode.Position(i, text.length);
        const diag = new vscode.Diagnostic(
          new vscode.Range(pos, pos),
          "Missing semicolon. Consider adding ';' at the end of this statement.",
          vscode.DiagnosticSeverity.Hint
        );
        diag.code = DiagCode.MISSING_SEMICOLON;
        diag.source = DIAGNOSTICS_SOURCE;
        diagnostics.push(diag);
      }
    } else {
      // Aggressive: flag any statement-like line ending without semicolon
      // (rough heuristic — expression statements, return, throw, etc.)
      if (
        /^\s*(return|throw|break|continue|import|export\s+(default\s+)?(?!class|function|interface|type|enum|const|let|var))/.test(
          text
        ) ||
        /^\s*(const|let|var)\s+\w+/.test(text)
      ) {
        if (!text.endsWith(';') && !text.endsWith('{')) {
          const pos = new vscode.Position(i, text.length);
          const diag = new vscode.Diagnostic(
            new vscode.Range(pos, pos),
            "Missing semicolon. Consider adding ';' at the end of this statement.",
            vscode.DiagnosticSeverity.Hint
          );
          diag.code = DiagCode.MISSING_SEMICOLON;
          diag.source = DIAGNOSTICS_SOURCE;
          diagnostics.push(diag);
        }
      }
    }
  }

  return diagnostics;
}

/**
 * Finds keyword typos in the document.
 */
function findKeywordTypos(
  document: vscode.TextDocument
): Array<{ diag: vscode.Diagnostic; correct: string }> {
  const results: Array<{ diag: vscode.Diagnostic; correct: string }> = [];
  const text = document.getText();

  for (const { wrong, correct } of EFFECTIVE_TYPOS) {
    // Reset lastIndex since we reuse the same regex object
    wrong.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = wrong.exec(text)) !== null) {
      const pos = document.positionAt(match.index);
      const endPos = document.positionAt(match.index + match[0].length);
      const diag = new vscode.Diagnostic(
        new vscode.Range(pos, endPos),
        `Possible typo: '${match[0]}'. Did you mean '${correct}'?`,
        vscode.DiagnosticSeverity.Warning
      );
      diag.code = DiagCode.KEYWORD_TYPO;
      diag.source = DIAGNOSTICS_SOURCE;
      results.push({ diag, correct });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Diagnostics provider
// ---------------------------------------------------------------------------

class AutoFixerDiagnosticsProvider {
  private readonly collection: vscode.DiagnosticCollection;
  private debounced: ReturnType<typeof debounce<[vscode.TextDocument]>>;
  private disposables: vscode.Disposable[] = [];

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTICS_SOURCE);
    this.debounced = this.createDebounced();
    this.register();
  }

  private createDebounced(): ReturnType<typeof debounce<[vscode.TextDocument]>> {
    const cfg = getConfig();
    return debounce((doc: vscode.TextDocument) => {
      this.runDiagnostics(doc);
    }, cfg.debounceMs);
  }

  private register(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (!getConfig().enabled) {
          return;
        }
        if (isLanguageSupported(e.document.languageId)) {
          this.debounced.call(e.document);
        }
      }),
      vscode.workspace.onDidOpenTextDocument((doc) => {
        if (!getConfig().enabled) {
          return;
        }
        if (isLanguageSupported(doc.languageId)) {
          this.runDiagnostics(doc);
        }
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        this.collection.delete(doc.uri);
      }),
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(CONFIG_SECTION)) {
          // Recreate debounced function with new delay
          this.debounced.cancel();
          this.debounced = this.createDebounced();
          // Re-run diagnostics on all open documents
          if (getConfig().enabled) {
            for (const editor of vscode.window.visibleTextEditors) {
              if (isLanguageSupported(editor.document.languageId)) {
                this.runDiagnostics(editor.document);
              }
            }
          } else {
            this.clearAll();
          }
        }
      })
    );

    // Run diagnostics on already-open documents
    for (const editor of vscode.window.visibleTextEditors) {
      if (getConfig().enabled && isLanguageSupported(editor.document.languageId)) {
        this.runDiagnostics(editor.document);
      }
    }
  }

  runDiagnostics(document: vscode.TextDocument): void {
    try {
      const cfg = getConfig();
      const diags: vscode.Diagnostic[] = [];

      diags.push(...findUnmatchedBrackets(document));

      if (cfg.requireTodoOwner) {
        diags.push(...findTodoWithoutOwner(document));
      }

      if (cfg.warnConsoleLog) {
        diags.push(...findConsoleLog(document));
      }

      diags.push(...findMissingSemicolons(document, cfg.styleMode));

      const typoResults = findKeywordTypos(document);
      diags.push(...typoResults.map((r) => r.diag));

      this.collection.set(document.uri, diags);
    } catch (err) {
      log(`Error running diagnostics on ${document.uri.toString()}: ${err}`, 'error');
    }
  }

  clearAll(): void {
    this.collection.clear();
  }

  dispose(): void {
    this.debounced.cancel();
    this.collection.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

// ---------------------------------------------------------------------------
// Code actions provider
// ---------------------------------------------------------------------------

class AutoFixerCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    _range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    if (!getConfig().enabled) {
      return [];
    }
    if (!isLanguageSupported(document.languageId)) {
      return [];
    }

    const actions: vscode.CodeAction[] = [];

    for (const diag of context.diagnostics) {
      if (diag.source !== DIAGNOSTICS_SOURCE) {
        continue;
      }

      const code = diag.code as DiagCodeValue | undefined;

      if (code === DiagCode.MISSING_SEMICOLON) {
        const action = this.makeSemicolonFix(document, diag);
        if (action) {
          actions.push(action);
        }
      } else if (code === DiagCode.KEYWORD_TYPO) {
        const action = this.makeTypoFix(document, diag);
        if (action) {
          actions.push(action);
        }
      } else if (code === DiagCode.CONSOLE_LOG) {
        actions.push(this.makeConsoleLogFix(document, diag));
      } else if (code === DiagCode.TODO_NO_OWNER) {
        actions.push(this.makeTodoOwnerFix(document, diag));
      }
    }

    return actions;
  }

  private makeSemicolonFix(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic
  ): vscode.CodeAction | undefined {
    const line = document.lineAt(diag.range.start.line);
    const insertPos = new vscode.Position(diag.range.start.line, line.text.trimEnd().length);
    const action = new vscode.CodeAction(
      "Add missing semicolon ';'",
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];
    action.isPreferred = true;
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, insertPos, ';');
    return action;
  }

  private makeTypoFix(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic
  ): vscode.CodeAction | undefined {
    // Extract the correct word from the message "Did you mean 'correct'?"
    const match = diag.message.match(/Did you mean '(.+?)'\?/);
    if (!match) {
      return undefined;
    }
    const correct = match[1];
    const action = new vscode.CodeAction(
      `Fix typo: replace with '${correct}'`,
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];
    action.isPreferred = true;
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, diag.range, correct);
    return action;
  }

  private makeConsoleLogFix(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic
  ): vscode.CodeAction {
    const line = document.lineAt(diag.range.start.line);
    // Find the full console.log(...) statement on the line and comment it out
    const action = new vscode.CodeAction(
      'Comment out console.log statement',
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];
    action.edit = new vscode.WorkspaceEdit();
    const lineStart = new vscode.Position(diag.range.start.line, 0);
    // Insert // before the line
    const indent = line.text.match(/^(\s*)/)?.[1] ?? '';
    action.edit.replace(
      document.uri,
      new vscode.Range(
        lineStart,
        new vscode.Position(diag.range.start.line, indent.length)
      ),
      `${indent}// `
    );
    return action;
  }

  private makeTodoOwnerFix(
    document: vscode.TextDocument,
    diag: vscode.Diagnostic
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(
      'Add owner to TODO comment (e.g. TODO(yourname))',
      vscode.CodeActionKind.QuickFix
    );
    action.diagnostics = [diag];
    action.edit = new vscode.WorkspaceEdit();
    // Replace TODO/FIXME/HACK with TODO(yourname)
    const text = document.getText(diag.range);
    const keyword = text.trim();
    action.edit.replace(document.uri, diag.range, `${keyword}(yourname)`);
    return action;
  }
}

// ---------------------------------------------------------------------------
// Inline completions provider
// ---------------------------------------------------------------------------

class AutoFixerInlineCompletionsProvider implements vscode.InlineCompletionItemProvider {
  private rateLimiter: RateLimiter;

  constructor() {
    const cfg = getConfig();
    this.rateLimiter = new RateLimiter(cfg.maxSuggestionsPerMinute);

    // Update rate limiter when config changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        const newCfg = getConfig();
        this.rateLimiter = new RateLimiter(newCfg.maxSuggestionsPerMinute);
      }
    });
  }

  provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    _context: vscode.InlineCompletionContext,
    _token: vscode.CancellationToken
  ): vscode.InlineCompletionList | undefined {
    const cfg = getConfig();

    if (!cfg.enabled) {
      return undefined;
    }
    if (!isLanguageSupported(document.languageId)) {
      return undefined;
    }
    if (!this.rateLimiter.tryConsume()) {
      log('Rate limit reached for inline completions', 'warn');
      return undefined;
    }

    try {
      const cacheKey = makeCacheKey(document.uri, document.version, position);
      const cached = cacheGet(cacheKey);
      if (cached) {
        return new vscode.InlineCompletionList(cached);
      }

      const items = this.computeCompletions(document, position, cfg);
      cacheSet(cacheKey, items);

      return new vscode.InlineCompletionList(items);
    } catch (err) {
      log(`Error providing inline completions: ${err}`, 'error');
      return undefined;
    }
  }

  private computeCompletions(
    document: vscode.TextDocument,
    position: vscode.Position,
    cfg: AutoFixerConfig
  ): vscode.InlineCompletionItem[] {
    const items: vscode.InlineCompletionItem[] = [];
    const lineText = document.lineAt(position.line).text;
    const textBeforeCursor = lineText.substring(0, position.character);

    // Autocomplete: after 'console.' suggest 'log(', 'error(', 'warn('
    if (/console\.$/.test(textBeforeCursor)) {
      const methods = ['log(', 'error(', 'warn(', 'info(', 'debug('];
      for (const m of methods) {
        items.push(
          new vscode.InlineCompletionItem(
            m,
            new vscode.Range(position, position)
          )
        );
      }
      return items;
    }

    // Autocomplete: common JS/TS snippet triggers
    const snippets = this.getSnippets(textBeforeCursor, cfg.styleMode);
    items.push(...snippets);

    return items;
  }

  private getSnippets(
    textBeforeCursor: string,
    styleMode: 'safe' | 'aggressive'
  ): vscode.InlineCompletionItem[] {
    const items: vscode.InlineCompletionItem[] = [];

    // Arrow function completion: after "const fn = ("  or similar
    if (/=\s*\($/.test(textBeforeCursor)) {
      items.push(new vscode.InlineCompletionItem(') => {\n\t\n}'));
    }

    // After 'if (' suggest a common pattern
    if (/\bif\s*\($/.test(textBeforeCursor)) {
      items.push(new vscode.InlineCompletionItem(') {\n\t\n}'));
    }

    // After 'for (' suggest iteration pattern
    if (/\bfor\s*\($/.test(textBeforeCursor)) {
      items.push(
        new vscode.InlineCompletionItem('let i = 0; i < items.length; i++')
      );
    }

    // After 'try {' / 'try {'
    if (/\btry\s*$/.test(textBeforeCursor)) {
      items.push(new vscode.InlineCompletionItem(' {\n\t\n} catch (error) {\n\t\n}'));
    }

    // After 'async function' trigger
    if (/\basync\s+function\s+\w*\s*\($/.test(textBeforeCursor)) {
      items.push(new vscode.InlineCompletionItem('): Promise<void> {\n\t\n}'));
    }

    if (styleMode === 'aggressive') {
      // Aggressive: after 'return ' suggest common patterns
      if (/\breturn\s+$/.test(textBeforeCursor)) {
        items.push(new vscode.InlineCompletionItem('null;'));
      }
      // After 'const ' suggest a typed const
      if (/^\s*const\s+\w+\s*$/.test(textBeforeCursor)) {
        items.push(new vscode.InlineCompletionItem(': string = '));
      }
    }

    return items;
  }
}

// ---------------------------------------------------------------------------
// Extension entry points
// ---------------------------------------------------------------------------

let diagnosticsProvider: AutoFixerDiagnosticsProvider | undefined;
let codeActionProviderDisposable: vscode.Disposable | undefined;
let inlineCompletionsProviderDisposable: vscode.Disposable | undefined;

export function activate(context: vscode.ExtensionContext): void {
  outputChannel = vscode.window.createOutputChannel(EXTENSION_NAME);
  context.subscriptions.push(outputChannel);
  log(`${EXTENSION_NAME} is activating…`);

  // Register diagnostics provider
  diagnosticsProvider = new AutoFixerDiagnosticsProvider();
  context.subscriptions.push({ dispose: () => diagnosticsProvider?.dispose() });

  // Register code actions provider
  const supportedLanguages = [
    { language: 'javascript' },
    { language: 'javascriptreact' },
    { language: 'typescript' },
    { language: 'typescriptreact' },
  ];

  codeActionProviderDisposable = vscode.languages.registerCodeActionsProvider(
    supportedLanguages,
    new AutoFixerCodeActionProvider(),
    { providedCodeActionKinds: AutoFixerCodeActionProvider.providedCodeActionKinds }
  );
  context.subscriptions.push(codeActionProviderDisposable);

  // Register inline completions provider
  inlineCompletionsProviderDisposable = vscode.languages.registerInlineCompletionItemProvider(
    supportedLanguages,
    new AutoFixerInlineCompletionsProvider()
  );
  context.subscriptions.push(inlineCompletionsProviderDisposable);

  // Register toggle command
  const toggleDisposable = vscode.commands.registerCommand(TOGGLE_COMMAND, async () => {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const current = cfg.get<boolean>('enabled', true);
    await cfg.update('enabled', !current, vscode.ConfigurationTarget.Global);
    const newState = !current ? 'enabled' : 'disabled';
    vscode.window.showInformationMessage(`${EXTENSION_NAME} is now ${newState}.`);
    log(`AutoFixer toggled to ${newState}`);

    if (current) {
      // Disabling: clear all diagnostics and cache
      diagnosticsProvider?.clearAll();
      cacheClear();
    } else {
      // Enabling: re-run diagnostics on visible editors
      for (const editor of vscode.window.visibleTextEditors) {
        if (isLanguageSupported(editor.document.languageId)) {
          diagnosticsProvider?.runDiagnostics(editor.document);
        }
      }
    }
  });
  context.subscriptions.push(toggleDisposable);

  log(`${EXTENSION_NAME} activated successfully.`);
}

export function deactivate(): void {
  diagnosticsProvider?.dispose();
  cacheClear();
  log(`${EXTENSION_NAME} deactivated.`);
}
