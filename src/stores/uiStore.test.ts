import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';
import type { Release } from '../lib/changelog';

const release: Release = {
  version: '0.2.0',
  date: '2026-07-01',
  sections: [{ label: 'Added', items: ['Thing'] }],
};

describe('uiStore zoom', () => {
  beforeEach(() => {
    useUIStore.getState().hydrateZoom('custom', 1);
    useUIStore.getState().setFitWidthZoom(1);
  });

  it('sets an explicit custom level, clamped', () => {
    useUIStore.getState().setZoomLevel(1.5);
    expect(useUIStore.getState().zoomLevel).toBe(1.5);
    expect(useUIStore.getState().zoomMode).toBe('custom');
    useUIStore.getState().setZoomLevel(99);
    expect(useUIStore.getState().zoomLevel).toBe(4);
  });

  it('steps the preset ladder', () => {
    useUIStore.getState().zoomStep(1);
    expect(useUIStore.getState().zoomLevel).toBeCloseTo(1.1);
    useUIStore.getState().zoomStep(-1);
    useUIStore.getState().zoomStep(-1);
    expect(useUIStore.getState().zoomLevel).toBeCloseTo(0.9);
  });

  it('fit-width renders the measured zoom and stepping out starts from it', () => {
    useUIStore.getState().setFitWidth();
    useUIStore.getState().setFitWidthZoom(1.72);
    expect(useUIStore.getState().effectiveZoom()).toBeCloseTo(1.72);
    // Leaving fit-width via a step starts from what the user sees (Acrobat).
    useUIStore.getState().zoomStep(1);
    expect(useUIStore.getState().zoomMode).toBe('custom');
    expect(useUIStore.getState().zoomLevel).toBeCloseTo(1.75);
  });

  it('actual size resets to 100% custom', () => {
    useUIStore.getState().setFitWidth();
    useUIStore.getState().actualSize();
    expect(useUIStore.getState().zoomMode).toBe('custom');
    expect(useUIStore.getState().zoomLevel).toBe(1);
  });

  it('hydrates persisted state without clamping surprises', () => {
    useUIStore.getState().hydrateZoom('fit-width', 1.3);
    expect(useUIStore.getState().zoomMode).toBe('fit-width');
    expect(useUIStore.getState().zoomLevel).toBe(1.3);
  });
});

describe('uiStore whats-new', () => {
  beforeEach(() => {
    useUIStore.getState().closeWhatsNew();
  });

  it('opens with the given releases and closes', () => {
    expect(useUIStore.getState().whatsNewOpen).toBe(false);
    useUIStore.getState().openWhatsNew([release]);
    expect(useUIStore.getState().whatsNewOpen).toBe(true);
    expect(useUIStore.getState().whatsNewReleases).toEqual([release]);
    useUIStore.getState().closeWhatsNew();
    expect(useUIStore.getState().whatsNewOpen).toBe(false);
  });
});
