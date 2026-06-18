import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { renderInline } from './inlineMarkdown';

/** Render an inline string to static HTML for assertions. */
const html = (md: string) => renderToStaticMarkup(<>{renderInline(md)}</>);

describe('renderInline', () => {
  it('passes plain text through unchanged', () => {
    expect(html('just text')).toBe('just text');
  });

  it('renders **bold** (and __bold__) as <strong>', () => {
    expect(html('**Automatic updates.** rest')).toBe(
      '<strong>Automatic updates.</strong> rest',
    );
    expect(html('__bold__')).toBe('<strong>bold</strong>');
  });

  it('renders *italic* (and _italic_) as <em>', () => {
    expect(html('an *emphasised* word')).toBe('an <em>emphasised</em> word');
    expect(html('an _emphasised_ word')).toBe('an <em>emphasised</em> word');
  });

  it('renders `code` as <code>', () => {
    expect(html('the `ONLINE_COLLAB` flag')).toBe(
      'the <code>ONLINE_COLLAB</code> flag',
    );
  });

  it('keeps markdown inside a code span literal', () => {
    expect(html('`**not bold**`')).toBe('<code>**not bold**</code>');
  });

  it('renders [text](url) as an anchor to the url', () => {
    const out = html('see [Keep a Changelog](https://keepachangelog.com)');
    expect(out).toContain('href="https://keepachangelog.com"');
    expect(out).toContain('>Keep a Changelog</a>');
  });

  it('parses nested marks inside bold', () => {
    expect(html('**a `b` c**')).toBe(
      '<strong>a <code>b</code> c</strong>',
    );
  });

  it('handles several marks in one line', () => {
    expect(html('**Cmd-aware links.** Hold ⌘ for a **jump history**.')).toBe(
      '<strong>Cmd-aware links.</strong> Hold ⌘ for a <strong>jump history</strong>.',
    );
  });

  it('escapes HTML-special characters as text', () => {
    expect(html('`<!-- … -->` comment')).toBe(
      '<code>&lt;!-- … --&gt;</code> comment',
    );
  });

  it('leaves an unterminated marker as literal text', () => {
    expect(html('a ** b')).toBe('a ** b');
    expect(html('use ` carefully')).toBe('use ` carefully');
  });
});
