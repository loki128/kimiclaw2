# Cleopatra Delights — Floating Architecture

> **This is a visual & interaction scaffold.**  
> Replace placeholder assets with high-quality, cohesive-toned photographs before any public launch.

---

## Table of Contents

1. [Overview](#overview)
2. [Folder Structure](#folder-structure)
3. [Run Instructions](#run-instructions)
4. [Replacing Assets](#replacing-assets)
5. [Design System Notes](#design-system-notes)
6. [Motion System](#motion-system)
7. [Reviewer Notes](#reviewer-notes)

---

## Overview

A premium, desktop-first static site scaffold for the **Cleopatra Delights** brand. The design language is defined by:

- Deep matte charcoal background (`#1a1a1a`) — not pure black
- Warm subtle gold accent (`#c9a84c`)
- Strong typographic hierarchy: serif headlines (`Georgia`) + clean sans body (`Helvetica Neue`)
- Large spacing, max content width **1200 px**, consistent vertical rhythm
- Soft depth shadows for floating layers
- No gradients, neon, overdone glow, or cartoon effects

### Sections

| # | Section | Description |
|---|---------|-------------|
| 1 | **Hero** | Full-viewport, centred title, two CTA buttons, architectural grid background, scroll indicator |
| 2 | **Floating Slabs** | 6 large product cards with 3-D tilt on hover and scroll parallax |
| 3 | **Architectural Divider** | Thin line geometric accent separating major sections |
| 4 | **Tonight's Drop** | 3-column product grid with stock badges and live countdown timer |
| 5 | **Brand Philosophy** | Typographic statement + three proof cards with subtle float animation |

---

## Folder Structure

```
cleopatra-delights/
├── index.html          ← Main HTML document (all five sections)
├── styles.css          ← All styles — CSS custom properties, typography, layout, motion
├── app.js              ← All JavaScript — reveal, tilt, parallax, countdown
├── README.md           ← This file
└── assets/
    ├── README.md       ← Instructions for replacing placeholder images
    ├── placeholder-slab-1.jpg  ← Replace: Dark Honey Baklava hero shot
    ├── placeholder-slab-2.jpg  ← Replace: Saffron Mille-Feuille
    ├── placeholder-slab-3.jpg  ← Replace: Black Sesame Tart
    ├── placeholder-slab-4.jpg  ← Replace: Cardamom Financier
    ├── placeholder-slab-5.jpg  ← Replace: Rose & Oud Panna Cotta
    ├── placeholder-slab-6.jpg  ← Replace: Smoked Chocolate Slab
    ├── placeholder-drop-1.jpg  ← Replace: Baklava Box (drop card)
    ├── placeholder-drop-2.jpg  ← Replace: Saffron Tasting Set (drop card)
    └── placeholder-drop-3.jpg  ← Replace: Chocolate Slab (drop card)
```

---

## Run Instructions

The site is a **static HTML/CSS/JS project** — no build step required.

### Option 1 — Python (built-in, recommended)

```bash
# Python 3
cd cleopatra-delights
python3 -m http.server 8080

# Then open:
# http://localhost:8080
```

```bash
# Python 2 (legacy)
cd cleopatra-delights
python -m SimpleHTTPServer 8080
```

### Option 2 — VS Code Live Server extension

1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension.
2. Right-click `index.html` → **Open with Live Server**.

### Option 3 — Node.js `serve`

```bash
npm install -g serve
cd cleopatra-delights
serve .
```

### Option 4 — `npx` (no global install)

```bash
cd cleopatra-delights
npx serve .
```

> **Important:** Always serve via a local HTTP server, not by opening `index.html` directly from the filesystem (`file://`).  
> Some browsers block `fetch` and certain resources over `file://` protocol.

---

## Replacing Assets

All images in `assets/` are **placeholder files** (see `assets/README.md`).  
Before launch, replace each file with a high-quality photograph:

| File | Recommended specs | Subject |
|------|-------------------|---------|
| `placeholder-slab-*.jpg` | 1200 × 800 px minimum, 72 dpi web-optimised | Hero product shot; dark, moody, high contrast |
| `placeholder-drop-*.jpg` | 1120 × 760 px minimum, 72 dpi web-optimised | Product packaging / overhead shot |

**Tone guidance:**  
Photos should have a dark, matte, editorial feel that matches the `#1a1a1a` background.  
Avoid bright white backgrounds, heavy HDR, or warm-orange food-blog lighting.  
Aim for neutral-dark surfaces (slate, dark marble, matte linen) with minimal props.

**File naming:**  
Keep the same file names when replacing, or update the `src` attributes in `index.html` accordingly.

---

## Design System Notes

All design tokens live in `:root { }` at the top of `styles.css`.  
Tuning any of the following CSS custom properties cascades through the entire design:

| Property | Description | Default |
|----------|-------------|---------|
| `--color-bg` | Page background | `#1a1a1a` |
| `--color-gold` | Primary accent | `#c9a84c` |
| `--color-text-primary` | Main text | `#f0ece4` |
| `--color-text-secondary` | Supporting text | `#a09880` |
| `--max-width` | Max content width | `1200px` |
| `--gutter` | Horizontal page padding | `2rem` |
| `--shadow-lg` | Default card shadow | see file |
| `--shadow-xl` | Elevated/hover shadow | see file |
| `--duration-base` | Base transition time | `0.4s` |
| `--duration-slow` | Slow transition / reveal | `0.6s` |
| `--ease-out` | Motion easing | `cubic-bezier(0.22, 0.61, 0.36, 1)` |
| `--slab-tilt-max` | Max 3-D tilt angle on hover | `6deg` |

### Typography Hierarchy

```
Hero headline   → var(--text-hero)  — clamp(4rem, 9vw, 7.5rem) — Georgia serif
Section titles  → var(--text-3xl)   — 3rem  — Georgia serif
Card titles     → var(--text-xl)    — 1.75rem — Georgia serif
Body copy       → var(--text-base)  — 1rem  — Helvetica Neue sans
Labels/eyebrows → var(--text-xs)    — 0.6875rem — uppercase, tracked
```

---

## Motion System

All animations share a single motion vocabulary defined by CSS custom properties:

| Property | Value |
|----------|-------|
| `--duration-fast` | `0.2s` |
| `--duration-base` | `0.4s` |
| `--duration-slow` | `0.6s` |
| `--ease-out` | `cubic-bezier(0.22, 0.61, 0.36, 1)` |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` |
| `--reveal-translate-y` | `28px` (upward reveal distance) |

### prefers-reduced-motion

The CSS `@media (prefers-reduced-motion: reduce)` block disables **all** transitions and animations site-wide.  
The JavaScript `prefersReducedMotion()` helper additionally skips:
- Slab 3-D tilt and hover depth
- Scroll parallax
- Proof card float animation
- Scroll-reveal transitions (elements are shown immediately instead)

---

## Reviewer Notes

### Accessibility

- **Keyboard navigation:** All interactive elements (buttons, links) are reachable and visible via `:focus-visible` which renders a `2px gold outline`.  No `outline: none` without a visible replacement.
- **Reduced motion:** Both CSS (`@media (prefers-reduced-motion: reduce)`) and JS (`prefersReducedMotion()`) guards are implemented.  Setting this OS/browser preference results in a fully static experience with zero animation.
- **ARIA:** Sections use `aria-label`, the countdown uses `aria-live="polite" aria-atomic="true"`, and all image `alt` attributes are descriptive.
- **Colour contrast:** Primary text (`#f0ece4`) on background (`#1a1a1a`) achieves > 14:1 contrast ratio (WCAG AAA).  Gold accent (`#c9a84c`) on dark background is used only for decorative elements and labels, not primary text.

### Replacing Placeholder Images

1. Source 9 high-quality photographs matching the dark editorial tone described in [Replacing Assets](#replacing-assets).
2. Export at the recommended dimensions as progressive JPEG (quality 82–88).
3. Replace files in `assets/` with matching filenames, **or** update `src` attributes in `index.html`.
4. Verify that each `alt` attribute accurately describes the new image content.

### Extending the Scaffold

- **Adding a new slab card:** Copy an `.slab` article block in `index.html`. The CSS grid handles layout automatically.
- **Adding a new drop card:** Copy a `.drop-card` article block. Adjust grid columns in `styles.css` if adding a 4th column.
- **Changing the countdown target:** Edit `initCountdown()` in `app.js` — the `target` Date object is clearly commented.
- **Adjusting tilt sensitivity:** Change `--slab-tilt-max` in `:root { }` (CSS) or `TILT_LERP` in `app.js`.

---

*Scaffold created: 2026 — Cleopatra Delights, Floating Architecture*
