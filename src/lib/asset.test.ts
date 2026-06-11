import { describe, expect, it } from 'vitest';
import { resolveImageSrc, resolveLinkHref, toAssetUrl } from './asset';

Object.defineProperty(globalThis, 'window', {
  value: {
    __TAURI_INTERNALS__: {
      convertFileSrc: (filePath: string, protocol = 'asset') => `${protocol}://${filePath}`,
    },
  },
  configurable: true,
});

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

describe('resolveImageSrc', () => {
  it('keeps https image URLs unchanged', () => {
    expect(resolveImageSrc('https://example.com/img.png', '/a/b/c.md')).toBe(
      'https://example.com/img.png',
    );
  });

  it('keeps data image URLs unchanged', () => {
    expect(resolveImageSrc('data:image/png;base64,abc', '/a/b/c.md')).toBe(
      'data:image/png;base64,abc',
    );
  });

  it('keeps asset image URLs unchanged', () => {
    expect(resolveImageSrc('asset://localhost/foo', '/a/b/c.md')).toBe('asset://localhost/foo');
  });

  it('keeps file image URLs unchanged', () => {
    expect(resolveImageSrc('file:///a/b/c.png', '/a/b/c.md')).toBe('file:///a/b/c.png');
  });

  it('keeps empty image src unchanged', () => {
    expect(resolveImageSrc('', '/a/b/c.md')).toBe('');
  });

  it('resolves sibling image paths relative to the current document', () => {
    expect(resolveImageSrc('./img.png', '/a/b/c.md')).toBe(toAssetUrl('/a/b/img.png'));
  });

  it('resolves parent image paths relative to the current document', () => {
    expect(resolveImageSrc('../assets/x.png', '/a/b/c.md')).toBe(toAssetUrl('/a/assets/x.png'));
  });

  it('resolves absolute image paths', () => {
    expect(resolveImageSrc('/abs/foo.png', '/a/b/c.md')).toBe(toAssetUrl('/abs/foo.png'));
  });

  it('decodes URL-encoded spaces before resolving image paths', () => {
    expect(resolveImageSrc('my%20pic.png', '/a/b/c.md')).toBe(toAssetUrl('/a/b/my pic.png'));
  });

  it('decodes URL-encoded non-ASCII characters before resolving image paths', () => {
    expect(resolveImageSrc('%E4%B8%AD%E6%96%87.png', '/a/b/c.md')).toBe(
      toAssetUrl('/a/b/中文.png'),
    );
  });

  it('resolves non-ASCII image paths', () => {
    expect(resolveImageSrc('中文.png', '/a/b/c.md')).toBe(toAssetUrl('/a/b/中文.png'));
  });

  it('strips query strings before resolving image paths', () => {
    expect(resolveImageSrc('img.png?v=2', '/a/b/c.md')).toBe(toAssetUrl('/a/b/img.png'));
  });

  it('strips fragments before resolving image paths', () => {
    expect(resolveImageSrc('img.png#anchor', '/a/b/c.md')).toBe(toAssetUrl('/a/b/img.png'));
  });

  it('keeps relative image paths unchanged without a document path', () => {
    expect(resolveImageSrc('pic.png', null)).toBe('pic.png');
  });

  it('normalizes nested relative image path segments', () => {
    expect(resolveImageSrc('./sub/dir/../img.png', '/a/b/c.md')).toBe(
      toAssetUrl('/a/b/sub/img.png'),
    );
  });
});
