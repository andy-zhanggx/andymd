// @vitest-environment happy-dom
import { editorViewCtx, serializerCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, it, expect } from 'vitest';
function ensure(){const d=document as any;if(d.compatMode!=='CSS1Compat')Object.defineProperty(d,'compatMode',{configurable:true,get:()=>'CSS1Compat'});if(!d.doctype&&d.documentElement)d.insertBefore(d.implementation.createDocumentType('html','',''),d.documentElement);}
async function mount(md:string):Promise<Editor>{ensure();const {buildEditor}=await import('./milkdownConfig');const root=document.createElement('div');document.body.appendChild(root);const e=await buildEditor({root,initialValue:md,onChange: () => {}, listener: false }).create();await new Promise(r=>setTimeout(r,0));return e;}

describe('html comments', () => {
  it('renders a single-line comment as one muted html node and round-trips', async () => {
    const md = '# T\n\n<!-- **ka_progress**: ${x} 格式：模板 -->\n\nafter';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    const spans = view.dom.querySelectorAll('span[data-type="html"]');
    expect(spans.length).toBe(1);
    expect(spans[0].getAttribute('data-value')).toBe('<!-- **ka_progress**: ${x} 格式：模板 -->');
    const ser = e.ctx.get(serializerCtx);
    expect(ser(view.state.doc)).toBe('# T\n\n<!-- **ka_progress**: ${x} 格式：模板 -->\n\nafter\n');
    await e.destroy();
  });

  it('keeps a multi-line comment containing an emoji as one node (no stray emoji)', async () => {
    const md = '# T\n\n<!-- **status**: ${status} eg:\n\n🟢 OnTrack -->\n\nafter';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    // The emoji inside the comment must NOT be extracted into a real emoji node.
    expect(view.dom.querySelectorAll('img.emoji').length).toBe(0);
    // The whole comment is a single inline html node.
    expect(view.dom.querySelectorAll('span[data-type="html"]').length).toBe(1);
    // Lossless round-trip, emoji preserved verbatim.
    const ser = e.ctx.get(serializerCtx);
    expect(ser(view.state.doc)).toBe(
      '# T\n\n<!-- **status**: ${status} eg:\n\n🟢 OnTrack -->\n\nafter\n',
    );
    await e.destroy();
  });

  it('leaves non-comment inline HTML untouched', async () => {
    const md = 'a <kbd>Esc</kbd> b';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    const ser = e.ctx.get(serializerCtx);
    // The <kbd> html nodes are not comments, so they keep default styling
    // (their data-value does not start with <!--) and still serialize.
    expect(ser(view.state.doc)).toContain('<kbd>');
    await e.destroy();
  });
});
