// @vitest-environment happy-dom
import { editorViewCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, it, expect } from 'vitest';
function ensure(){const d=document as any;if(d.compatMode!=='CSS1Compat')Object.defineProperty(d,'compatMode',{configurable:true,get:()=>'CSS1Compat'});if(!d.doctype&&d.documentElement)d.insertBefore(d.implementation.createDocumentType('html','',''),d.documentElement);}
async function mount(md:string):Promise<Editor>{ensure();const {buildEditor}=await import('./milkdownConfig');const root=document.createElement('div');document.body.appendChild(root);const e=await buildEditor({root,initialValue:md,onChange:()=>{}}).create();await new Promise(r=>setTimeout(r,0));return e;}
describe('mermaid diagram', () => {
  it('recognizes a ```mermaid block as a diagram node (no crash)', async () => {
    const md = '# t\n\n```mermaid\ngraph TD\nA-->B\n```\n';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    let hasDiagram = false;
    view.state.doc.descendants((n) => { if (n.type.name === 'diagram') hasDiagram = true; });
    expect(hasDiagram).toBe(true);
    await e.destroy();
  });
});
