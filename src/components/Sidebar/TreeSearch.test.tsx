import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TreeSearch, TREE_SEARCH_HEIGHT } from './TreeSearch';

const noop = () => {};

describe('TreeSearch', () => {
  it('renders a labelled filter input at its declared height', () => {
    const html = renderToStaticMarkup(
      <TreeSearch root="/v" onFilter={noop} mode="filter" onModeChange={noop} semanticReady={false} />,
    );
    expect(html).toContain('Filter files by name or content');
    expect(html).toContain('placeholder="Filter files…"');
    expect(html).toContain(`height:${TREE_SEARCH_HEIGHT}px`);
    // No clear button or hint until there is a query.
    expect(html).not.toContain('Clear filter');
    expect(html).toContain('aria-pressed="false"');
  });

  it('switches placeholder and marks the toggle in semantic mode', () => {
    const html = renderToStaticMarkup(
      <TreeSearch
        root="/v"
        onFilter={noop}
        mode="semantic"
        onModeChange={noop}
        semanticReady
        hint="Ready"
      />,
    );
    expect(html).toContain('placeholder="Search by meaning…"');
    expect(html).toContain('treesearch-mode active');
    expect(html).toContain('aria-pressed="true"');
    // Semantic mode shows the status hint even with an empty query.
    expect(html).toContain('>Ready<');
  });
});
