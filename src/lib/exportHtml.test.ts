import { describe, it, expect } from 'vitest';
import { buildExportHtml } from './exportHtml';

describe('buildExportHtml', () => {
  const html = buildExportHtml({ title: 'My Doc', body: '<h1>Hi</h1><p>body</p>' });

  it('produces a full standalone document', () => {
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('</html>');
  });

  it('includes the title and body', () => {
    expect(html).toContain('<title>My Doc</title>');
    expect(html).toContain('<h1>Hi</h1><p>body</p>');
  });

  it('embeds reading styles and KaTeX CSS', () => {
    expect(html).toContain('.markdown-body');
    expect(html).toContain('katex');
  });

  it('escapes HTML in the title', () => {
    const h = buildExportHtml({ title: '<script>x</script>', body: '' });
    expect(h).toContain('<title>&lt;script&gt;x&lt;/script&gt;</title>');
    expect(h).not.toContain('<title><script>');
  });
});
