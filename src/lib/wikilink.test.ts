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
});
