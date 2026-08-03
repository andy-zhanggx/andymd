import { describe, it, expect } from 'vitest';
import {
  clampZoom,
  stepZoom,
  fitWidthZoom,
  formatZoom,
  ZOOM_MIN,
  ZOOM_MAX,
  EDITOR_COLUMN_WIDTH,
} from './zoom';

describe('clampZoom', () => {
  it('clamps to the 25%–400% range', () => {
    expect(clampZoom(0.1)).toBe(ZOOM_MIN);
    expect(clampZoom(10)).toBe(ZOOM_MAX);
    expect(clampZoom(1.5)).toBe(1.5);
  });

  it('falls back to 100% on garbage', () => {
    expect(clampZoom(NaN)).toBe(1);
    expect(clampZoom(Infinity)).toBe(1);
  });
});

describe('stepZoom', () => {
  it('steps up and down the preset ladder from exact stops', () => {
    expect(stepZoom(1, 1)).toBeCloseTo(1.1);
    expect(stepZoom(1, -1)).toBeCloseTo(0.9);
    expect(stepZoom(2, 1)).toBeCloseTo(2.5);
  });

  it('snaps to the next stop from an in-between pinch level', () => {
    expect(stepZoom(1.07, 1)).toBeCloseTo(1.1);
    expect(stepZoom(1.07, -1)).toBeCloseTo(1);
  });

  it('is not stuck by float error near a stop', () => {
    expect(stepZoom(0.9999999, 1)).toBeCloseTo(1.1);
  });

  it('saturates at the range ends', () => {
    expect(stepZoom(4, 1)).toBe(ZOOM_MAX);
    expect(stepZoom(0.25, -1)).toBe(ZOOM_MIN);
  });
});

describe('fitWidthZoom', () => {
  it('fills the pane with the fixed column', () => {
    expect(fitWidthZoom(1480, 740)).toBeCloseTo(2);
    expect(fitWidthZoom(555, 740)).toBeCloseTo(0.75);
  });

  it('is 1 for a fluid (full-width) column', () => {
    expect(fitWidthZoom(1480, EDITOR_COLUMN_WIDTH.full)).toBe(1);
  });

  it('clamps extreme panes and tolerates zero widths', () => {
    expect(fitWidthZoom(100000, 740)).toBe(4);
    expect(fitWidthZoom(0, 740)).toBe(1);
  });
});

describe('formatZoom', () => {
  it('renders whole percentages', () => {
    expect(formatZoom(1)).toBe('100%');
    expect(formatZoom(1.256)).toBe('126%');
  });
});
