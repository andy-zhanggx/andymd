import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NodeName } from './FileTree';

describe('NodeName', () => {
  it('renders the plain name when no query is active', () => {
    const html = renderToStaticMarkup(<NodeName name="roadmap.md" query={null} />);
    expect(html).toContain('roadmap.md');
    expect(html).not.toContain('<mark');
  });

  it('wraps case-insensitive matches in a highlight mark', () => {
    const html = renderToStaticMarkup(<NodeName name="Roadmap-2026.md" query="road" />);
    expect(html).toContain('<mark class="filetree-hit">Road</mark>');
    expect(html).toContain('map-2026.md');
  });

  it('leaves a name without a hit unmarked (folder-path match)', () => {
    const html = renderToStaticMarkup(<NodeName name="notes.md" query="projects" />);
    expect(html).not.toContain('<mark');
    expect(html).toContain('notes.md');
  });
});
