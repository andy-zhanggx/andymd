import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { EditorBuildError } from './EditorBuildError';

describe('EditorBuildError', () => {
  it('surfaces a recovery message, the underlying error, and a reload control', () => {
    const html = renderToStaticMarkup(
      <EditorBuildError message="Cannot read properties of undefined (localsInner)" onReload={() => {}} />,
    );
    // Announced to assistive tech rather than silently blanking the pane.
    expect(html).toContain('role="alert"');
    // A human-readable explanation of what went wrong.
    expect(html).toMatch(/could.{0,3}t open|failed to load/i);
    // The raw error detail is shown so the failure is diagnosable, not swallowed.
    expect(html).toContain('Cannot read properties of undefined (localsInner)');
    // A way to recover without restarting the app.
    expect(html).toContain('Reload editor');
  });
});
