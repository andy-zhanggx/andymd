import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';
import type { Release } from '../lib/changelog';

const release: Release = {
  version: '0.2.0',
  date: '2026-07-01',
  sections: [{ label: 'Added', items: ['Thing'] }],
};

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
