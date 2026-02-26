# AutoFixer VS Code Extension

A **live autocorrect-style coding helper** for JavaScript and TypeScript. AutoFixer watches your code as you type and provides real-time diagnostics, quick fixes, and inline completions — all without any external AI calls or internet connectivity.

---

## Features

| Feature | Description |
|---------|-------------|
| 🔍 **Diagnostics** | Unmatched brackets, TODO without owner, `console.log` warnings, missing semicolons, keyword typos |
| ⚡ **Quick Fixes** | One-click fixes for semicolons, typos, `console.log`, and TODO tags |
| 💡 **Inline Completions** | Context-aware code snippet suggestions as you type |
| ⚙️ **Configurable** | Debounce, rate limiting, safe/aggressive mode, per-language toggle |
| 🚀 **Fast & Debounced** | All analysis is debounced; in-memory cache avoids redundant work |
| 🔒 **No external calls** | 100% local — no AI, no telemetry, no network requests |

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [VS Code](https://code.visualstudio.com/) ≥ 1.85

### Setup

```bash
# Clone the repository
git clone https://github.com/loki128/kimiclaw2.git
cd kimiclaw2

# Install dependencies
npm install

# Build the extension
npm run compile
```

### Running in Development (F5)

1. Open this folder in VS Code.
2. Press **F5** — VS Code will compile the extension and open a new **Extension Development Host** window.
3. Open any `.js` or `.ts` file in the new window to see AutoFixer in action.

---

## Usage

### Commands

| Command | Description |
|---------|-------------|
| `AutoFixer: Toggle Enable/Disable` | Toggle the extension on/off globally |

Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and type **AutoFixer**.

### Diagnostics at a Glance

AutoFixer adds colored squiggle underlines as you type:

- 🔴 **Error** — Unmatched or mismatched brackets (`{`, `[`, `(`)
- 🟡 **Warning** — `console.log` statements, keyword typos
- 🔵 **Info** — TODO/FIXME/HACK comments without an owner tag
- 💡 **Hint** — Missing semicolons

Hover over any squiggle to see the message, then click the lightbulb (or press `Ctrl+.`) to apply a quick fix.

### Inline Completions

AutoFixer provides snippet completions while you type. Examples:

| Trigger | Suggestion |
|---------|------------|
| `if (` | `) {\n\t\n}` |
| `for (` | `let i = 0; i < array.length; i++` |
| `try` | ` {\n\t\n} catch (error) {\n\t\n}` |
| `console.` | `log(`, `error(`, `warn(`, `info(`, `debug(` |
| `= (` | `) => {\n\t\n}` |

Suggestions respect your `styleMode` setting — `safe` provides fewer but higher-confidence completions, while `aggressive` adds more.

---

## Configuration

All settings live under the `autoFixer` namespace in VS Code settings (`settings.json`).

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `autoFixer.enabled` | boolean | `true` | Enable/disable the extension |
| `autoFixer.debounceMs` | number | `300` | Delay (ms) before analysis runs after a change |
| `autoFixer.maxSuggestionsPerMinute` | number | `30` | Rate limit for inline completions |
| `autoFixer.styleMode` | `"safe"` \| `"aggressive"` | `"safe"` | How liberal to be with suggestions |
| `autoFixer.languages` | string[] | `["javascript","javascriptreact","typescript","typescriptreact"]` | Active languages |
| `autoFixer.warnConsoleLog` | boolean | `true` | Warn on `console.log` usage |
| `autoFixer.requireTodoOwner` | boolean | `true` | Require `TODO(owner)` format |

### Example `settings.json`

```json
{
  "autoFixer.enabled": true,
  "autoFixer.debounceMs": 200,
  "autoFixer.maxSuggestionsPerMinute": 60,
  "autoFixer.styleMode": "aggressive",
  "autoFixer.warnConsoleLog": true,
  "autoFixer.requireTodoOwner": true
}
```

---

## How It Works

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     AutoFixer Extension                  │
│                                                          │
│  ┌──────────────────────┐   ┌───────────────────────┐   │
│  │ DiagnosticsProvider  │   │ CodeActionProvider    │   │
│  │  - brackets          │   │  - semicolon fix      │   │
│  │  - TODO owner        │   │  - typo fix           │   │
│  │  - console.log       │   │  - console.log fix    │   │
│  │  - semicolons        │   │  - TODO owner fix     │   │
│  │  - keyword typos     │   └───────────────────────┘   │
│  └──────────┬───────────┘                                │
│             │ debounced                                   │
│             ▼                                            │
│  ┌──────────────────────┐   ┌───────────────────────┐   │
│  │  onChange / onOpen   │   │ InlineCompletions     │   │
│  │  event handler       │   │  - rate limited       │   │
│  └──────────────────────┘   │  - in-memory cached   │   │
│                              │  - snippet-based      │   │
│                              └───────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │              In-Memory Cache                      │   │
│  │  key: uri + documentVersion + cursorPosition     │   │
│  │  max 200 entries (LRU eviction)                  │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

1. **Debouncing** — Diagnostics are recomputed only after `debounceMs` milliseconds of inactivity, preventing the analysis from running on every keystroke.

2. **In-Memory Cache** — Inline completions are cached by `uri + documentVersion + cursorPosition`. The cache holds up to 200 entries with simple LRU eviction. Cache is cleared when the extension is disabled.

3. **Rate Limiting** — A sliding-window counter ensures inline completions are not generated faster than `maxSuggestionsPerMinute`.

4. **No External Calls** — All analysis is performed locally using regex-based heuristics and VS Code's built-in APIs. No network requests, no AI, no telemetry.

5. **Error Isolation** — Every provider wraps its logic in `try/catch` and logs errors to the AutoFixer output channel, ensuring one bad document never crashes the extension.

---

## Project Structure

```
kimiclaw2/
├── src/
│   └── extension.ts      # All extension logic
├── out/                  # Compiled JS (generated)
├── .vscode/
│   ├── launch.json       # F5 debug configuration
│   └── tasks.json        # Background TypeScript watcher
├── .gitignore
├── .vscodeignore
├── package.json          # Extension manifest & dependencies
├── tsconfig.json         # TypeScript configuration
└── README.md
```

---

## Diagnostic Codes

| Code | Name | Severity | Description |
|------|------|----------|-------------|
| AF001 | UNMATCHED_BRACKET | Error | Unmatched or mismatched `{`, `[`, `(` |
| AF002 | TODO_NO_OWNER | Info | TODO/FIXME/HACK without `(owner)` tag |
| AF003 | CONSOLE_LOG | Warning | `console.log` statement detected |
| AF004 | MISSING_SEMICOLON | Hint | Statement likely missing `;` |
| AF005 | KEYWORD_TYPO | Warning | Common keyword misspelling detected |

---

## Limitations / Known Issues

- Bracket matching is heuristic — complex template literals with nested brackets may produce false positives.
- Missing semicolon detection uses conservative patterns; it does not run a full AST parse.
- Inline completions are snippet-based and do not use full language server intelligence.

---

## License

MIT
