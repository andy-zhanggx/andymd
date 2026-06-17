import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhatsNewView } from './WhatsNew';
import type { Release } from '../lib/changelog';

const releases: Release[] = [
  {
    version: '0.2.0',
    date: '2026-07-01',
    sections: [
      { label: 'Added', items: ['Cool thing', 'Another thing'] },
      { label: 'Fixed', items: ['A bug'] },
    ],
  },
];

describe('WhatsNewView', () => {
  it('renders each version, section label and bullet', () => {
    const html = renderToStaticMarkup(<WhatsNewView releases={releases} onClose={() => {}} />);
    expect(html).toContain('0.2.0');
    expect(html).toContain('2026-07-01');
    expect(html).toContain('Added');
    expect(html).toContain('Cool thing');
    expect(html).toContain('Another thing');
    expect(html).toContain('Fixed');
    expect(html).toContain('A bug');
  });

  it('renders nothing meaningful for an empty release list but does not throw', () => {
    const html = renderToStaticMarkup(<WhatsNewView releases={[]} onClose={() => {}} />);
    expect(html).toContain('What');
  });
});
