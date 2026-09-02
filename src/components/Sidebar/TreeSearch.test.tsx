import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TreeSearch, TREE_SEARCH_HEIGHT } from './TreeSearch';

describe('TreeSearch', () => {
  it('renders a labelled filter input at its declared height', () => {
    const html = renderToStaticMarkup(<TreeSearch root="/v" onFilter={() => {}} />);
    expect(html).toContain('Filter files by name or content');
    expect(html).toContain('placeholder="Filter files…"');
    expect(html).toContain(`height:${TREE_SEARCH_HEIGHT}px`);
    // No clear button or hint until there is a query.
    expect(html).not.toContain('Clear filter');
  });
});
