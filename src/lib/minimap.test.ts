import { describe, expect, it } from 'vitest';
import { minimapLayout, scrollTopForStripY, MinimapMetrics } from './minimap';

// A tall document: 10000px of content in a 800px scroller, thumbnail scaled to
// 1000px shown through a 600px strip.
const tall: MinimapMetrics = {
  scrollTop: 0,
  scrollHeight: 10000,
  clientHeight: 800,
  scaledHeight: 1000,
  stripHeight: 600,
};

// A short document: everything fits in the scroller (no scrolling possible).
const short: MinimapMetrics = {
  scrollTop: 0,
  scrollHeight: 800,
  clientHeight: 800,
  scaledHeight: 80,
  stripHeight: 600,
};

describe('minimapLayout', () => {
  it('starts at the top with no pan and the viewport at 0', () => {
    const l = minimapLayout(tall);
    expect(l.offset).toBe(0);
    expect(l.viewportTop).toBe(0);
    expect(l.viewportHeight).toBeCloseTo(1000 * (800 / 10000));
  });

  it('ends at the bottom fully panned with the viewport at its drag limit', () => {
    const l = minimapLayout({ ...tall, scrollTop: 10000 - 800 });
    expect(l.offset).toBeCloseTo(1000 - 600); // pan = scaledHeight - stripHeight
    expect(l.viewportTop).toBeCloseTo(l.dragRange);
    // Indicator bottom lands exactly on the strip bottom.
    expect(l.viewportTop + l.viewportHeight).toBeCloseTo(600);
  });

  it('moves linearly with scroll position', () => {
    const half = minimapLayout({ ...tall, scrollTop: (10000 - 800) / 2 });
    const full = minimapLayout({ ...tall, scrollTop: 10000 - 800 });
    expect(half.offset).toBeCloseTo(full.offset / 2);
    expect(half.viewportTop).toBeCloseTo(full.viewportTop / 2);
  });

  it('never pans when the thumbnail fits inside the strip', () => {
    const l = minimapLayout({ ...short, scaledHeight: 80 });
    expect(l.offset).toBe(0);
  });

  it('shows a full-height viewport when nothing can scroll', () => {
    const l = minimapLayout(short);
    expect(l.viewportTop).toBe(0);
    expect(l.viewportHeight).toBeCloseTo(80); // covers the whole thumbnail
  });

  it('clamps out-of-range scrollTop', () => {
    const l = minimapLayout({ ...tall, scrollTop: 99999 });
    expect(l.viewportTop).toBeCloseTo(l.dragRange);
  });
});

describe('scrollTopForStripY', () => {
  it('round-trips with minimapLayout', () => {
    const scrolled = { ...tall, scrollTop: 3500 };
    const { viewportTop } = minimapLayout(scrolled);
    expect(scrollTopForStripY(scrolled, viewportTop)).toBeCloseTo(3500);
  });

  it('clamps to the scrollable range', () => {
    expect(scrollTopForStripY(tall, -50)).toBe(0);
    expect(scrollTopForStripY(tall, 99999)).toBeCloseTo(10000 - 800);
  });

  it('returns 0 when the document cannot scroll', () => {
    expect(scrollTopForStripY(short, 300)).toBe(0);
  });
});
