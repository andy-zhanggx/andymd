// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, it, expect } from 'vitest';

function ensure() {
  const d = document as any;
  if (d.compatMode !== 'CSS1Compat')
    Object.defineProperty(d, 'compatMode', { configurable: true, get: () => 'CSS1Compat' });
  if (!d.doctype && d.documentElement)
    d.insertBefore(d.implementation.createDocumentType('html', '', ''), d.documentElement);
}
async function mount(md: string): Promise<Editor> {
  ensure();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const e = await buildEditor({ root, initialValue: md, onChange: () => {}, listener: false }).create();
  await new Promise((r) => setTimeout(r, 0));
  return e;
}

// The twemoji remark transform rewrites ANY literal mdast node whose value
// matches emoji-regex — historically including block `math`, which split the
// node into math+emoji+math and put an inline emoji directly under doc:
// "Cannot create node for doc", document unopenable. These tests pin the guard.
describe('emoji transform must not corrupt non-text literals', () => {
  it('opens a doc whose $$ math contains an emoji-range char (↔) without crashing', async () => {
    const md = ['$$', 'a \\leftrightarrow b \\quad ↔', '$$'].join('\n');
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    let math = '';
    view.state.doc.descendants((n) => {
      if (n.type.name === 'math_block') math = n.attrs.value as string;
    });
    // The math survives intact — no twemoji <img> markup injected, ↔ kept.
    expect(math).toContain('↔');
    expect(math).not.toContain('<img');
    await e.destroy();
  });

  it('keeps emoji-range chars in inline code literal', async () => {
    const e = await mount('before `x ↔ y` after');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('code img')).toBeNull();
    expect(view.state.doc.textContent).toContain('x ↔ y');
    await e.destroy();
  });

  it('opens a doc with emoji in the YAML frontmatter without crashing', async () => {
    const e = await mount('---\ntitle: hello ↔ there\n---\n\nbody text');
    const view = e.ctx.get(editorViewCtx);
    expect(view.state.doc.textContent).toContain('body text');
    await e.destroy();
  });

  it('still renders plain-text emoji as twemoji images (existing behavior)', async () => {
    const e = await mount('look ↔ here');
    const view = e.ctx.get(editorViewCtx);
    expect(view.dom.querySelector('img.emoji')).not.toBeNull();
    await e.destroy();
  });
});
