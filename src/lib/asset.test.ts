import { describe, expect, it } from 'vitest';
import { resolveLinkHref } from './asset';

describe('resolveLinkHref', () => {
  it('resolves https URLs as external links', () => {
    expect(resolveLinkHref('https://example.com', '/a/b/c.md')).toEqual({
      kind: 'external',
      href: 'https://example.com',
    });
  });

  it('resolves mailto URLs as external links', () => {
    expect(resolveLinkHref('mailto:foo@bar.com', '/a/b/c.md')).toEqual({
      kind: 'external',
      href: 'mailto:foo@bar.com',
    });
  });

  it('resolves sibling markdown links relative to the current document', () => {
    expect(resolveLinkHref('./other.md', '/a/b/c.md')).toEqual({
      kind: 'mdfile',
      absPath: '/a/b/other.md',
    });
  });

  it('resolves parent markdown links relative to the current document', () => {
    expect(resolveLinkHref('../d/e.md', '/a/b/c.md')).toEqual({
      kind: 'mdfile',
      absPath: '/a/d/e.md',
    });
  });

  it('strips fragments before resolving markdown links', () => {
    expect(resolveLinkHref('foo.md#bar', '/a/b/c.md')).toEqual({
      kind: 'mdfile',
      absPath: '/a/b/foo.md',
    });
  });

  it('resolves absolute markdown paths as markdown files', () => {
    expect(resolveLinkHref('/abs/path.md', '/a/b/c.md')).toEqual({
      kind: 'mdfile',
      absPath: '/abs/path.md',
    });
  });

  it('ignores anchor-only links', () => {
    expect(resolveLinkHref('#anchor-only', '/a/b/c.md')).toEqual({ kind: 'ignore' });
  });

  it('ignores relative non-markdown links', () => {
    expect(resolveLinkHref('image.png', '/a/b/c.md')).toEqual({ kind: 'ignore' });
  });

  it('ignores relative markdown links without a document path', () => {
    expect(resolveLinkHref('./x.md', null)).toEqual({ kind: 'ignore' });
  });

  it('decodes URL-encoded path segments before resolving', () => {
    expect(resolveLinkHref('./hello%20world.md', '/a/b/c.md')).toEqual({
      kind: 'mdfile',
      absPath: '/a/b/hello world.md',
    });
  });
});
