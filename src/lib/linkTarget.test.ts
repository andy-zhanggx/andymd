import { describe, expect, it } from 'vitest';
import { resolveLinkTarget } from './linkTarget';
import type { FileNode } from '../types';

const tree: FileNode = {
  path: '/ws',
  name: 'ws',
  kind: 'dir',
  children: [
    { path: '/ws/README.md', name: 'README.md', kind: 'file' },
    { path: '/ws/note.md', name: 'note.md', kind: 'file' },
    {
      path: '/ws/07.data',
      name: '07.data',
      kind: 'dir',
      children: [
        { path: '/ws/07.data/README.md', name: 'README.md', kind: 'file' },
        { path: '/ws/07.data/raw.csv', name: 'raw.csv', kind: 'file' },
      ],
    },
    { path: '/ws/06.algo', name: '06.algo', kind: 'dir', children: [] },
  ],
};

const FROM = '/ws/README.md';

describe('resolveLinkTarget', () => {
  it('opens a directory link via its index note', () => {
    expect(resolveLinkTarget('07.data/', FROM, tree)).toEqual({
      kind: 'mdfile',
      absPath: '/ws/07.data/README.md',
    });
  });

  it('resolves a ./ relative markdown file', () => {
    expect(resolveLinkTarget('./note.md', FROM, tree)).toEqual({
      kind: 'mdfile',
      absPath: '/ws/note.md',
    });
  });

  it('resolves an extensionless link by appending .md', () => {
    expect(resolveLinkTarget('note', FROM, tree)).toEqual({
      kind: 'mdfile',
      absPath: '/ws/note.md',
    });
  });

  it('treats an existing non-markdown file as an OS file', () => {
    expect(resolveLinkTarget('07.data/raw.csv', FROM, tree)).toEqual({
      kind: 'osfile',
      absPath: '/ws/07.data/raw.csv',
    });
  });

  it('opens an index-less directory as an OS folder', () => {
    expect(resolveLinkTarget('06.algo/', FROM, tree)).toEqual({
      kind: 'osfile',
      absPath: '/ws/06.algo',
    });
  });

  it('marks a missing in-vault target as dead', () => {
    expect(resolveLinkTarget('missing.md', FROM, tree)).toEqual({
      kind: 'dead',
      absPath: '/ws/missing.md',
    });
    expect(resolveLinkTarget('07.data/gone.md', FROM, tree).kind).toBe('dead');
  });

  it('classifies an out-of-vault link by extension, never dead', () => {
    expect(resolveLinkTarget('../../outside.md', FROM, tree)).toEqual({
      kind: 'mdfile',
      absPath: '/outside.md',
    });
  });

  it('passes external + mailto through, ignores bare anchors', () => {
    expect(resolveLinkTarget('https://example.com', FROM, tree)).toEqual({
      kind: 'external',
      href: 'https://example.com',
    });
    expect(resolveLinkTarget('mailto:a@b.com', FROM, tree).kind).toBe('external');
    expect(resolveLinkTarget('#section', FROM, tree)).toEqual({ kind: 'ignore' });
  });

  it('strips the #fragment before resolving', () => {
    expect(resolveLinkTarget('note.md#heading', FROM, tree)).toEqual({
      kind: 'mdfile',
      absPath: '/ws/note.md',
    });
  });
});
