import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdateButtonView } from './UpdateButton';

describe('UpdateButtonView', () => {
  it('shows a restart button when ready', () => {
    const html = renderToStaticMarkup(
      <UpdateButtonView status="ready" version="0.2.0" onRestart={() => {}} />,
    );
    expect(html).toContain('Restart to update');
  });
  it('shows updating text while downloading', () => {
    const html = renderToStaticMarkup(
      <UpdateButtonView status="downloading" version="0.2.0" onRestart={() => {}} />,
    );
    expect(html.toLowerCase()).toContain('updating');
  });
  it('renders nothing when idle', () => {
    const html = renderToStaticMarkup(
      <UpdateButtonView status="idle" version={null} onRestart={() => {}} />,
    );
    expect(html).toBe('');
  });
});
