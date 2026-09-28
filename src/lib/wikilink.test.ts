import { describe, expect, it } from 'vitest';
import { resolveWikilinkInTree } from './wikilink';
import type { FileNode } from '../types';

const vault: FileNode = {
  path: '/vault',
  name: 'vault',
  kind: 'dir',
  children: [
    {
      path: '/vault/03-resources',
      name: '03-resources',
      kind: 'dir',
      children: [
        {
          path: '/vault/03-resources/ads',
          name: 'ads',
          kind: 'dir',
          children: [
            {
              path: '/vault/03-resources/ads/organic-vs-ads-pcoc-label-semantics.md',
              name: 'organic-vs-ads-pcoc-label-semantics.md',
              kind: 'file',
            },
          ],
        },
        {
          path: '/vault/03-resources/sql-recipes',
          name: 'sql-recipes',
          kind: 'dir',
          children: [
            {
              path: '/vault/03-resources/sql-recipes/organic-pcoc-by-category',
              name: 'organic-pcoc-by-category',
              kind: 'dir',
              children: [
                {
                  path: '/vault/03-resources/sql-recipes/organic-pcoc-by-category/index.md',
                  name: 'index.md',
                  kind: 'file',
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

describe('resolveWikilinkInTree', () => {
  it('resolves a bare name by basename search', () => {
    expect(resolveWikilinkInTree('organic-vs-ads-pcoc-label-semantics', vault)).toBe(
      '/vault/03-resources/ads/organic-vs-ads-pcoc-label-semantics.md',
    );
  });

  it('resolves a vault-relative path', () => {
    expect(
      resolveWikilinkInTree('03-resources/sql-recipes/organic-pcoc-by-category/index', vault),
    ).toBe('/vault/03-resources/sql-recipes/organic-pcoc-by-category/index.md');
  });

  it('is case-insensitive on basenames', () => {
    expect(resolveWikilinkInTree('Organic-VS-Ads-pCOC-Label-Semantics', vault)).toBe(
      '/vault/03-resources/ads/organic-vs-ads-pcoc-label-semantics.md',
    );
  });

  it('returns null when the note does not exist', () => {
    expect(resolveWikilinkInTree('no-such-note', vault)).toBeNull();
    expect(resolveWikilinkInTree('03-resources/missing/path', vault)).toBeNull();
  });

  it('tolerates an explicit .md extension in the target', () => {
    expect(resolveWikilinkInTree('organic-vs-ads-pcoc-label-semantics.md', vault)).toBe(
      '/vault/03-resources/ads/organic-vs-ads-pcoc-label-semantics.md',
    );
  });

  it('resolves a ./-relative target against the current file directory', () => {
    expect(
      resolveWikilinkInTree(
        './organic-vs-ads-pcoc-label-semantics',
        vault,
        '/vault/03-resources/ads/current-note.md',
      ),
    ).toBe('/vault/03-resources/ads/organic-vs-ads-pcoc-label-semantics.md');
  });

  it('resolves a ../-relative target against the parent directory', () => {
    expect(
      resolveWikilinkInTree(
        '../sql-recipes/organic-pcoc-by-category/index',
        vault,
        '/vault/03-resources/ads/current-note.md',
      ),
    ).toBe('/vault/03-resources/sql-recipes/organic-pcoc-by-category/index.md');
  });

  it('returns null for a ./-relative target with no real file (dead link)', () => {
    expect(resolveWikilinkInTree('./', vault, '/vault/03-resources/ads/current-note.md')).toBeNull();
    expect(
      resolveWikilinkInTree('./nope', vault, '/vault/03-resources/ads/current-note.md'),
    ).toBeNull();
  });

  it('treats a ./-relative target as dead when there is no current file', () => {
    expect(resolveWikilinkInTree('./organic-vs-ads-pcoc-label-semantics', vault, null)).toBeNull();
  });
});

describe('splitWikilinkTarget / resolveVaultFile', () => {
  const tree: FileNode = {
    path: '/v',
    name: 'v',
    kind: 'dir',
    children: [
      { path: '/v/Note.md', name: 'Note.md', kind: 'file' },
      {
        path: '/v/img',
        name: 'img',
        kind: 'dir',
        children: [
          { path: '/v/img/Pic.PNG', name: 'Pic.PNG', kind: 'file' },
          { path: '/v/img/doc.pdf', name: 'doc.pdf', kind: 'file' },
        ],
      },
    ],
  };

  it('splits heading and block parts', async () => {
    const { splitWikilinkTarget } = await import('./wikilink');
    expect(splitWikilinkTarget('Note#My Heading')).toEqual({ path: 'Note', heading: 'My Heading', block: null });
    expect(splitWikilinkTarget('Note#^abc123')).toEqual({ path: 'Note', heading: null, block: 'abc123' });
    expect(splitWikilinkTarget('#Local')).toEqual({ path: '', heading: 'Local', block: null });
    expect(splitWikilinkTarget(' Note ')).toEqual({ path: 'Note', heading: null, block: null });
  });

  it('resolves notes with a heading suffix, and same-note links', () => {
    expect(resolveWikilinkInTree('note#Heading', tree)).toBe('/v/Note.md');
    expect(resolveWikilinkInTree('#Heading', tree, '/v/Note.md')).toBe('/v/Note.md');
    expect(resolveWikilinkInTree('#Heading', tree)).toBeNull();
  });

  it('resolves attachments by exact name or path', async () => {
    const { resolveVaultFile } = await import('./wikilink');
    expect(resolveVaultFile('pic.png', tree)).toBe('/v/img/Pic.PNG');
    expect(resolveVaultFile('img/doc.pdf', tree)).toBe('/v/img/doc.pdf');
    expect(resolveVaultFile('./img/doc.pdf', tree, '/v/Note.md')).toBe('/v/img/doc.pdf');
    expect(resolveVaultFile('missing.png', tree)).toBeNull();
    expect(resolveVaultFile('Note', tree)).toBe('/v/Note.md');
  });
});
