// @vitest-environment happy-dom

import { editorStateCtx } from '@milkdown/core';
import type { Editor } from '@milkdown/core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lenifyHeadings } from '../../lib/markdown';

function fixture(name: string): string {
  return readFileSync(resolve(__dirname, '__fixtures__', name), 'utf-8');
}

function ensureStandardsMode() {
  if (document.compatMode !== 'CSS1Compat') {
    Object.defineProperty(document, 'compatMode', {
      configurable: true,
      get: () => 'CSS1Compat',
    });
  }

  if (!document.doctype && document.documentElement) {
    document.insertBefore(
      document.implementation.createDocumentType('html', '', ''),
      document.documentElement,
    );
  }
}

async function mount(
  md: string,
): Promise<{
  root: HTMLElement;
  cleanup: () => Promise<void>;
  editor: Editor;
}> {
  ensureStandardsMode();
  const { buildEditor } = await import('./milkdownConfig');
  const root = document.createElement('div');
  document.body.appendChild(root);
  const editor = await buildEditor({
    root,
    initialValue: md,
    onChange: () => {},
  }).create();
  await new Promise((r) => setTimeout(r, 0));
  return {
    editor,
    root,
    cleanup: async () => {
      try {
        await editor.destroy();
      } catch {
        // noop
      }
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
    const md = lenifyHeadings(fixture('chinese-heading.md'));
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
      expect(root.querySelector('del, s, strike')?.textContent).toBe('strikethrough');
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
      expect(root.querySelectorAll('tbody tr[data-is-header="true"] th').length).toBe(2);
      expect(root.querySelectorAll('tbody tr:not([data-is-header="true"])').length).toBe(2);
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

  it('renders YAML frontmatter as a metadata block, not headings', async () => {
    const { editor, root, cleanup } = await mount(fixture('frontmatter.md'));
    try {
      // Frontmatter must render as a dedicated block...
      const block = root.querySelector('[data-type="frontmatter"]');
      expect(block).toBeTruthy();
      expect(block?.textContent).toContain('type: tech-note');

      // ...not as a giant setext heading + thematic break.
      const headings = [...root.querySelectorAll('h1, h2, h3')];
      expect(headings.some((h) => h.textContent?.includes('tech-note'))).toBe(false);
      expect(headings.some((h) => h.textContent === 'Diagnosis')).toBe(true);
      expect(root.querySelector('hr')).toBeNull();

      // Serialization must round-trip the frontmatter fence intact.
      const { getMarkdown } = await import('@milkdown/utils');
      const md = editor.action(getMarkdown());
      expect(md.startsWith('---\ntype: tech-note')).toBe(true);
      expect(md).toContain('tags: [pcoc, calibration, organic]');
      expect(md.split('---\n').length).toBeGreaterThanOrEqual(2);
    } finally {
      await cleanup();
    }
  });

  it('renders wikilinks as link elements with alias and path support', async () => {
    const { editor, root, cleanup } = await mount(fixture('wikilink.md'));
    try {
      const links = [...root.querySelectorAll('[data-type="wikilink"]')];
      expect(links.length).toBe(3);
      expect(links[0]?.textContent).toBe('organic-vs-ads-pcoc-label-semantics');
      expect(links[0]?.getAttribute('data-target')).toBe('organic-vs-ads-pcoc-label-semantics');
      // Alias form displays the alias but keeps the target.
      expect(links[1]?.textContent).toBe('the mixer note');
      expect(links[1]?.getAttribute('data-target')).toBe('api0-mixer');
      expect(links[2]?.getAttribute('data-target')).toBe(
        '03-resources/sql-recipes/organic-pcoc-by-category/index',
      );
      // No raw [[ ]] left as plain text.
      expect(root.textContent).not.toContain('[[');

      // Serialization round-trips the wikilink syntax.
      const { getMarkdown } = await import('@milkdown/utils');
      const md = editor.action(getMarkdown());
      expect(md).toContain('[[organic-vs-ads-pcoc-label-semantics]]');
      expect(md).toContain('[[api0-mixer|the mixer note]]');
      expect(md).toContain('[[03-resources/sql-recipes/organic-pcoc-by-category/index]]');
    } finally {
      await cleanup();
    }
  });

  it('renders inline and block math via KaTeX', async () => {
    const { editor, cleanup } = await mount(fixture('math.md'));
    try {
      const mathNodeNames = editor.action((ctx) => {
        const names = new Set<string>();
        ctx.get(editorStateCtx).doc.descendants((node) => {
          if (node.type.name.includes('math')) {
            names.add(node.type.name);
          }
          return true;
        });
        return [...names];
      });

      expect(mathNodeNames.some((name) => name.includes('math'))).toBe(true);
    } finally {
      await cleanup();
    }
  });
});
