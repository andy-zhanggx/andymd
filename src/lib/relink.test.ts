import { describe, it, expect } from 'vitest';
import { mapPath, mentionNeedles, relativePath, rewriteNote, type RelinkContext } from './relink';
import type { FileNode } from '../types';

const file = (path: string): FileNode => ({ path, name: path.split('/').pop()!, kind: 'file' });
const dir = (path: string, children: FileNode[]): FileNode => ({
  path,
  name: path.split('/').pop()!,
  kind: 'dir',
  children,
});

const tree = dir('/v', [
  file('/v/Home.md'),
  file('/v/Old Name.md'),
  dir('/v/proj', [file('/v/proj/Plan.md'), file('/v/proj/diagram.png'), file('/v/proj/Index.md')]),
  dir('/v/other', [file('/v/other/Index.md')]),
]);

const ctx = (from: string, to: string): RelinkContext => ({ root: '/v', tree, rename: { from, to } });

describe('paths', () => {
  it('maps files and folder contents', () => {
    const r = { from: '/v/proj', to: '/v/work' };
    expect(mapPath('/v/proj/Plan.md', r)).toBe('/v/work/Plan.md');
    expect(mapPath('/v/project.md', r)).toBe('/v/project.md');
    expect(mapPath('/v/proj', r)).toBe('/v/work');
  });
  it('computes relative paths', () => {
    expect(relativePath('/v/a', '/v/b/c.md')).toBe('../b/c.md');
    expect(relativePath('/v', '/v/b/c.md')).toBe('b/c.md');
    expect(relativePath('/v/a/b', '/v/a/c.md')).toBe('../c.md');
  });
});

describe('rewriteNote — renaming a note', () => {
  const c = ctx('/v/Old Name.md', '/v/New Name.md');

  it('rewrites bare wikilinks, keeping heading, alias and embed marker', () => {
    const md = 'See [[Old Name]], [[old name#Intro|the intro]] and ![[Old Name]].';
    expect(rewriteNote(md, '/v/Home.md', '/v/Home.md', c)).toEqual({
      content: 'See [[New Name]], [[New Name#Intro|the intro]] and ![[New Name]].',
      changes: 3,
    });
  });

  it('keeps an explicit .md extension and rewrites markdown links with encoding', () => {
    const md = '[[Old Name.md]] [a](Old%20Name.md#part) [b](<./Old Name.md> "t")';
    expect(rewriteNote(md, '/v/Home.md', '/v/Home.md', c).content).toBe(
      '[[New Name.md]] [a](New%20Name.md#part) [b](<./New Name.md> "t")',
    );
  });

  it('leaves unrelated links, external links and code alone', () => {
    const md = '[[Home]] [x](https://e.com/Old%20Name.md) `[[Old Name]]`\n\n```\n[[Old Name]]\n```\n';
    expect(rewriteNote(md, '/v/Home.md', '/v/Home.md', c)).toEqual({ content: md, changes: 0 });
  });
});

describe('rewriteNote — renaming a folder', () => {
  const c = ctx('/v/proj', '/v/work');

  it('updates path-form and relative links; bare unique names still resolve', () => {
    const md = '[[proj/Plan]] [[Plan]] ![img](proj/diagram.png) [p](./proj/Plan.md)';
    expect(rewriteNote(md, '/v/Home.md', '/v/Home.md', c).content).toBe(
      '[[work/Plan]] [[Plan]] ![img](work/diagram.png) [p](./work/Plan.md)',
    );
  });

  it("recomputes a moved note's own relative links to files outside the folder", () => {
    const md = '[home](../Home.md) [[../Home]] [plan](Plan.md)';
    // Moving proj → deeper/work changes the depth.
    const deeper = ctx('/v/proj', '/v/deeper/work');
    expect(rewriteNote(md, '/v/proj/Index.md', '/v/deeper/work/Index.md', deeper).content).toBe(
      '[home](../../Home.md) [[../../Home]] [plan](Plan.md)',
    );
  });

  it('uses the vault path when the new bare name would be ambiguous', () => {
    const t = dir('/v', [file('/v/A.md'), file('/v/Home.md'), dir('/v/x', [file('/v/x/Index.md')])]);
    const unique: RelinkContext = { root: '/v', tree: t, rename: { from: '/v/Home.md', to: '/v/Start.md' } };
    expect(rewriteNote('[[Home]]', '/v/A.md', '/v/A.md', unique).content).toBe('[[Start]]');
    const clash: RelinkContext = { root: '/v', tree: t, rename: { from: '/v/Home.md', to: '/v/y/Index.md' } };
    expect(rewriteNote('[[Home]]', '/v/A.md', '/v/A.md', clash).content).toBe('[[y/Index]]');
  });
});

describe('mentionNeedles', () => {
  it('covers name, extension and encodings', () => {
    expect(mentionNeedles({ from: '/v/Old Name.md', to: '/v/x.md' })).toEqual(
      expect.arrayContaining(['old name', 'old name.md', 'old%20name']),
    );
  });
});
