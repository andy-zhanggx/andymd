import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SemanticConsent } from './SemanticConsent';
import { SemanticNotice } from './SemanticResults';
import { OFF_STATUS } from '../../lib/semantic';

const noop = () => {};

describe('SemanticConsent', () => {
  it('explains the download and offers enable / not now', () => {
    const html = renderToStaticMarkup(
      <SemanticConsent defaultEndpoint="" onEnable={noop} onCancel={noop} />,
    );
    expect(html).toContain('bge-small-zh-v1.5');
    expect(html).toContain('95 MB');
    expect(html).toContain('entirely on this Mac');
    expect(html).toContain('Enable');
    expect(html).toContain('Not now');
    // Mirror field is collapsed behind a link until needed.
    expect(html).toContain('Use a mirror');
    expect(html).not.toContain('type="url"');
  });

  it('shows the mirror field pre-filled when one is configured', () => {
    const html = renderToStaticMarkup(
      <SemanticConsent defaultEndpoint="https://hf-mirror.com" onEnable={noop} onCancel={noop} />,
    );
    expect(html).toContain('type="url"');
    expect(html).toContain('value="https://hf-mirror.com"');
  });
});

describe('SemanticNotice', () => {
  const render = (status: Partial<typeof OFF_STATUS>, query = '', searching = false, hasHits = false) =>
    renderToStaticMarkup(
      <SemanticNotice
        status={{ ...OFF_STATUS, ...status }}
        query={query}
        searching={searching}
        hasHits={hasHits}
        onRetry={noop}
      />,
    );

  it('renders each phase', () => {
    expect(render({ phase: 'error', message: 'model load failed: boom' })).toContain('boom');
    expect(render({ phase: 'error' })).toContain('Retry');
    expect(render({ phase: 'loading-model' })).toContain('Loading model');
    const indexing = render({ phase: 'indexing', done: 3, total: 12 });
    expect(indexing).toContain('3/12');
    expect(indexing).toContain('aria-valuenow="25"');
    expect(render({ phase: 'off' })).toContain('is off');
    expect(render({ phase: 'ready', files: 10, chunks: 40 })).toContain('10 notes · 40 passages');
    expect(render({ phase: 'ready' }, 'q', true)).toContain('Searching');
    expect(render({ phase: 'ready' }, 'q', false, false)).toContain('No related notes');
    expect(render({ phase: 'ready' }, 'q', false, true)).toBe('');
  });
});
