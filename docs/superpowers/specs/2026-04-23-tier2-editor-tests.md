# Tier 2 Automated Verification — Milkdown Editor Integration Tests

**Date:** 2026-04-23
**Branch:** `feature/v0.1-mvp`
**Status:** Approved (Andy, 2026-04-23)

## Goal

Add a **regression barrier** that would catch the two classes of bugs we've already hit:

1. **Runtime mount bugs** (like B2 — StrictMode race / async `create()` fire-and-forget)
2. **Parsing behavior regressions** (like C — `##标题` lenient headings)

Without standing up a full E2E harness (Tier 3).

## Approach

Use Vitest with a **DOM environment per file** (via `happy-dom`) to:

1. Mount a real Milkdown `Editor` against a real `<div>` with a fixture Markdown string as `initialValue`
2. `await editor.create()` — the exact code path the app uses
3. Assert on the resulting DOM (counts of `<h2>`, `<strong>`, `<table>`, presence of expected text, etc.)

This reuses `buildEditor` from production code unchanged, so any regression in the editor config or any breakage like B2 (missing await) will fail a test.

### Why `happy-dom` and not `jsdom`

ProseMirror (Milkdown's core) touches selection APIs, `getComputedStyle`, and `contentEditable` behavior. `happy-dom` implements these closer to spec; `jsdom` is known to hit walls with ProseMirror rendering. `happy-dom` is also ~3× faster.

### Why per-file `@vitest-environment`

Existing tests run in Node environment. DOM-requiring tests get the directive `// @vitest-environment happy-dom` at the top of the file. No global config change; existing tests untouched.

## Scope

### In

- `happy-dom` install
- 5 fixture `.md` files under `src/components/Editor/__fixtures__/`
- 1 integration test file with 5 mount assertions
- 4 unit tests for `lenifyHeadings` (extracted to importable helper)
- Both must run under a single `pnpm test` invocation

### Out

- Scroll position restoration testing (requires real scroll + paint; defer)
- Save/conflict roundtrip (already covered by existing documentStore tests)
- Tauri IPC (mocked)
- Image `asset:` resolution (Tauri-only URL transform; mocked happy-path only)
- CI integration (not v0.1 scope; Andy can set up later)

## Fallback plan

If `happy-dom` + Milkdown hit wall (editor fails to mount or throws), the test file downgrades to **ProseMirror state inspection** instead of DOM assertions:

```ts
const state = editor.ctx.get(editorStateCtx);
const nodeTypes: string[] = [];
state.doc.descendants((n) => { nodeTypes.push(n.type.name); });
expect(nodeTypes).toContain('heading');
```

This tests the schema/parse level instead of the render level. Still catches parser regressions and the "editor did not initialize" class of bugs.

## Implementation plan

### 1. Extract `lenifyHeadings` helper

Currently defined inside `documentStore.ts` as a private function. Move to `src/lib/markdown.ts` and export:

```ts
// src/lib/markdown.ts
export function lenifyHeadings(md: string): string {
  return md.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');
}
```

Update `documentStore.ts` to `import { lenifyHeadings } from '../lib/markdown';`.

### 2. Unit tests for `lenifyHeadings`

`src/lib/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { lenifyHeadings } from './markdown';

describe('lenifyHeadings', () => {
  it('inserts space after leading #s for all levels H1-H6', () => {
    const out = lenifyHeadings('#a\n##b\n###c\n####d\n#####e\n######f');
    expect(out).toBe('# a\n## b\n### c\n#### d\n##### e\n###### f');
  });

  it('leaves already-spaced headings untouched', () => {
    const src = '# Title\n## Heading 2\n### With multiple words';
    expect(lenifyHeadings(src)).toBe(src);
  });

  it('does not modify # appearing mid-line', () => {
    const src = 'text with # not a heading\nprice is $100 # off';
    expect(lenifyHeadings(src)).toBe(src);
  });

  it('does not treat 7+ # as a heading', () => {
    // 7 # is not a heading in CommonMark; our regex matches 1-6 and then [^\s#],
    // so 7+ # followed by non-space stays untouched.
    const src = '#######7hash';
    expect(lenifyHeadings(src)).toBe(src);
  });

  it('handles mixed valid and invalid lines', () => {
    const src = '# Good\n##bad\ntext\n### Also good\n####nope';
    expect(lenifyHeadings(src)).toBe('# Good\n## bad\ntext\n### Also good\n#### nope');
  });
});
```

### 3. Fixtures

Create under `src/components/Editor/__fixtures__/`:

- `basic-heading.md`:
  ```markdown
  # Title

  Some paragraph text.

  ## Subtitle

  More text.
  ```

- `chinese-heading.md` (post-lenify expected):
  ```markdown
  ## 数学解释

  正文段落。

  ### 子标题

  更多内容。
  ```

- `bold-italic.md`:
  ```markdown
  This is **bold** and *italic* and ~~strikethrough~~ and `code`.
  ```

- `gfm-table.md`:
  ```markdown
  | A | B |
  |---|---|
  | 1 | 2 |
  | 3 | 4 |
  ```

- `code-block.md`:
  ````markdown
  ```rust
  fn main() {
    println!("hello");
  }
  ```
  ````

### 4. Install `happy-dom`

```bash
pnpm add -D happy-dom
```

(Orchestrator pre-installs before dispatching.)

### 5. Integration test

`src/components/Editor/MarkdownEditor.integration.test.ts`:

```ts
// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildEditor } from './milkdownConfig';
import { lenifyHeadings } from '../../lib/markdown';

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, '__fixtures__', name), 'utf-8');
}

async function mount(md: string): Promise<{ root: HTMLElement; cleanup: () => Promise<void> }> {
  const root = document.createElement('div');
  document.body.appendChild(root);
  const editor = await buildEditor({
    root,
    initialValue: md,
    onChange: () => {},
  }).create();
  // Give ProseMirror one tick to flush initial render
  await new Promise((r) => setTimeout(r, 0));
  return {
    root,
    cleanup: async () => {
      try { await editor.destroy(); } catch { /* noop */ }
      root.remove();
    },
  };
}

describe('MarkdownEditor integration (happy-dom)', () => {
  it('renders H1 and H2 from basic headings', async () => {
    const { root, cleanup } = await mount(fixture('basic-heading.md'));
    try {
      expect(root.querySelectorAll('h1').length).toBeGreaterThanOrEqual(1);
      expect(root.querySelectorAll('h2').length).toBeGreaterThanOrEqual(1);
      expect(root.textContent).toContain('Title');
      expect(root.textContent).toContain('Subtitle');
    } finally {
      await cleanup();
    }
  });

  it('renders Chinese headings after lenify normalization', async () => {
    // Simulate documentStore.open() which applies lenifyHeadings first.
    const raw = '##数学解释\n\n正文段落。\n\n###子标题\n\n更多内容。\n';
    const md = lenifyHeadings(raw);
    const { root, cleanup } = await mount(md);
    try {
      expect(root.querySelectorAll('h2').length).toBeGreaterThanOrEqual(1);
      expect(root.querySelectorAll('h3').length).toBeGreaterThanOrEqual(1);
      expect(root.textContent).toContain('数学解释');
      expect(root.textContent).toContain('子标题');
    } finally {
      await cleanup();
    }
  });

  it('renders bold, italic, strikethrough, inline code', async () => {
    const { root, cleanup } = await mount(fixture('bold-italic.md'));
    try {
      expect(root.querySelector('strong')?.textContent).toBe('bold');
      expect(root.querySelector('em')?.textContent).toBe('italic');
      expect(root.querySelector('del, s')?.textContent).toBe('strikethrough');
      expect(root.querySelector('code')?.textContent).toBe('code');
    } finally {
      await cleanup();
    }
  });

  it('renders GFM tables', async () => {
    const { root, cleanup } = await mount(fixture('gfm-table.md'));
    try {
      const table = root.querySelector('table');
      expect(table).toBeTruthy();
      expect(root.querySelectorAll('thead th').length).toBe(2);
      expect(root.querySelectorAll('tbody tr').length).toBe(2);
    } finally {
      await cleanup();
    }
  });

  it('renders fenced code blocks', async () => {
    const { root, cleanup } = await mount(fixture('code-block.md'));
    try {
      const pre = root.querySelector('pre');
      expect(pre).toBeTruthy();
      expect(pre?.textContent).toContain('fn main');
    } finally {
      await cleanup();
    }
  });
});
```

### Fallback if mount fails

If any test fails because Milkdown/ProseMirror can't mount in `happy-dom`, the Codex implementer should:

1. Confirm with a minimal `it('mounts', ...)` smoke test
2. If mount fails, switch to ProseMirror state inspection approach:
   ```ts
   import { editorStateCtx } from '@milkdown/core';
   // After create:
   const state = editor.ctx.get(editorStateCtx);
   const types: string[] = [];
   state.doc.descendants((n) => types.push(n.type.name));
   expect(types).toContain('heading');
   ```
3. Note the fallback in the commit message and update this spec file with what was needed.

## Verify (post-implementation)

- `pnpm test` shows 18 + 4 (lenifyHeadings) + 5 (editor integration) = **27 passing**
- `pnpm exec tsc --noEmit -p tsconfig.app.json` — clean
- Tests run under 2 seconds total

## Commit

Single commit:
```
test(v0.1): Milkdown integration test harness + lenifyHeadings unit tests

- Install happy-dom for DOM-capable vitest environment
- 5 fixture .md files under src/components/Editor/__fixtures__/
- MarkdownEditor.integration.test.ts mounts real Milkdown + asserts DOM
- Extract lenifyHeadings to src/lib/markdown.ts with 5 unit tests
- These tests would have caught B2 (StrictMode race) and C (lenient headings)

Spec: docs/superpowers/specs/2026-04-23-tier2-editor-tests.md
```

## Done criteria

- 27 tests pass
- `tsc` clean
- Integration test file uses only `happy-dom` environment directive; does not perturb existing tests' Node environment
