# Math Formula Support (KaTeX)

**Date:** 2026-04-23
**Branch:** `feature/v0.1-mvp`
**Status:** Approved (Andy, 2026-04-23)
**Scope shift:** Originally v0.2; pulled forward into the v0.1 tail since the underlying app infrastructure is ready and the main blocker (Milkdown rendering) is solved.

## Goal

Render LaTeX math via KaTeX in the Milkdown editor:

- Inline: `$y = mx + b$`
- Block: `$$\int_0^\infty e^{-x} dx = 1$$`

## Constraints

- Inline delimiter is `$...$`, but **must not** trigger on ambient dollar signs (e.g., "price is $5 and I paid $10"). The established heuristic: require `$` to be adjacent to non-space on the inside, not flanked by digits on both sides. Milkdown's math plugin already implements this; we rely on it.
- Block: a paragraph whose content is exactly `$$...$$` (possibly multi-line).
- Rendering errors (bad LaTeX) should show a red inline error, not crash the editor.
- Theme parity: KaTeX's default style is light-background; we accept that for v0.1 and add a minimal CSS override for dark theme to prevent white-box glare.

## Plan

### 1. Dependencies

```bash
pnpm add @milkdown/plugin-math katex
```

Import KaTeX CSS (once, globally) in `MarkdownEditor` or `milkdownConfig`:
```ts
import 'katex/dist/katex.min.css';
```

### 2. Wire into `src/components/Editor/milkdownConfig.ts`

Add to the plugin chain after `prism`:
```ts
import { math } from '@milkdown/plugin-math';
// ...
.use(math)
```

### 3. Dark theme polish

Append to `editor-styles.css`:
```css
:root[data-theme="dark"] .editor-container .katex {
  color: var(--fg-primary);
}
:root[data-theme="dark"] .editor-container .katex-display {
  background: transparent;
}
.editor-container .katex-error {
  color: #c43d3d;
}
```

### 4. Fixture + integration tests

New fixture `src/components/Editor/__fixtures__/math.md`:
```markdown
Inline: $y = mx + b$

Block:

$$\int_0^\infty e^{-x} dx = 1$$
```

In `MarkdownEditor.integration.test.ts`, add:
```ts
it('renders inline and block math via KaTeX', async () => {
  const { root, cleanup } = await mount(fixture('math.md'));
  try {
    // KaTeX renders LaTeX into span.katex / span.katex-display
    expect(root.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2);
    expect(root.querySelector('.katex-display')).toBeTruthy();
  } finally {
    await cleanup();
  }
});
```

### 5. Risks / fallback

- `@milkdown/plugin-math` may depend on a Milkdown utility package we don't have (e.g., `@milkdown/utils`). If `pnpm add` picks up peers, fine. If not, install explicitly based on error.
- If the plugin's API differs in 7.x (e.g., named export is `$math` not `math`), adjust import and note in commit message.
- If happy-dom can't render KaTeX (KaTeX requires layout / measure APIs), the integration test downgrades to checking that the math nodes exist in the ProseMirror doc (`type.name === 'math_inline'` or `math_block`).

## Done criteria

- `pnpm test` passes with the new math test (29 total: 28 + 1)
- `tsc --noEmit` clean
- Manual: open a `.md` with `$y = mx + b$` and `$$\sum ... $$` — both render as math
- Bad LaTeX like `$\unknown{}$` shows red error, editor doesn't crash

## Commit

Single commit:
```
feat(editor): KaTeX math formula support (inline + block)

Pulls math rendering forward from v0.2 into v0.1 tail. Adds
@milkdown/plugin-math + katex, imports KaTeX CSS, wires into the
editor plugin chain, and adds a fixture + integration test.

Spec: docs/superpowers/specs/2026-04-23-math-support.md
```
