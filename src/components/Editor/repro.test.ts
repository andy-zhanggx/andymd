// @vitest-environment happy-dom
import { editorViewCtx, serializerCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { describe, it, expect } from 'vitest';
import { writeFileSync, appendFileSync } from 'node:fs';
const LOG='/tmp/repro.log'; writeFileSync(LOG,'');
const rec=(s:string)=>appendFileSync(LOG,s+'\n');
function ensure(){const d=document as any;if(d.compatMode!=='CSS1Compat')Object.defineProperty(d,'compatMode',{configurable:true,get:()=>'CSS1Compat'});if(!d.doctype&&d.documentElement)d.insertBefore(d.implementation.createDocumentType('html','',''),d.documentElement);}
async function mount(md:string):Promise<Editor>{ensure();const {buildEditor}=await import('./milkdownConfig');const root=document.createElement('div');document.body.appendChild(root);const e=await buildEditor({root,initialValue:md,onChange: () => {}, listener: false }).create();await new Promise(r=>setTimeout(r,0));return e;}

describe('REPRO', () => {
  it('block math renders katex (multi-line)', async () => {
    const md = '$$\n\\mathcal{G}_m(\\alpha,\\beta)\n:=\n\\left\\{ g_m \\right\\}\n$$';
    const e = await mount(md);
    const view = e.ctx.get(editorViewCtx);
    rec(JSON.stringify(['BLOCK MATH HTML:', view.dom.innerHTML.slice(0, 800)]));
    rec(JSON.stringify(['katex count:', view.dom.querySelectorAll('.katex').length]));
    await e.destroy();
  });

  it('inline math renders katex', async () => {
    const e = await mount('Inline $y = mx + b$ here');
    const view = e.ctx.get(editorViewCtx);
    rec(JSON.stringify(['INLINE MATH HTML:', view.dom.innerHTML.slice(0, 800)]));
    rec(JSON.stringify(['inline katex count:', view.dom.querySelectorAll('.katex').length]));
    await e.destroy();
  });

  it('image renders', async () => {
    const e = await mount('![alt](foo.png)');
    const view = e.ctx.get(editorViewCtx);
    rec(JSON.stringify(['IMAGE HTML:', view.dom.innerHTML.slice(0, 800)]));
    await e.destroy();
  });

  it('comment renders', async () => {
    const e = await mount('<!-- hello -->');
    const view = e.ctx.get(editorViewCtx);
    rec(JSON.stringify(['COMMENT HTML:', view.dom.innerHTML.slice(0, 800)]));
    await e.destroy();
  });
});
