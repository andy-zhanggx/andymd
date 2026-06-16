// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, it, expect } from 'vitest';
function ensure(){const d=document as any;if(d.compatMode!=='CSS1Compat')Object.defineProperty(d,'compatMode',{configurable:true,get:()=>'CSS1Compat'});if(!d.doctype&&d.documentElement)d.insertBefore(d.implementation.createDocumentType('html','',''),d.documentElement);}
async function mount(md:string):Promise<Editor>{ensure();const {buildEditor}=await import('./milkdownConfig');const root=document.createElement('div');document.body.appendChild(root);const e=await buildEditor({root,initialValue:md,onChange:()=>{}}).create();await new Promise(r=>setTimeout(r,0));return e;}
describe('emoji (:shortcode:)', () => {
  it('parses :smile: into an emoji node without crashing the editor', async () => {
    const e = await mount('hello :smile: world');
    const view = e.ctx.get(editorViewCtx);
    // editor mounted and rendered some content for the shortcode
    expect(view.dom.textContent).toContain('hello');
    expect(view.dom.textContent).toContain('world');
    // the literal ":smile:" should have been transformed (not left verbatim)
    expect(view.dom.querySelector('.emoji, img.emoji, [data-type="emoji"]') || !view.dom.textContent?.includes(':smile:')).toBeTruthy();
    await e.destroy();
  });
});
