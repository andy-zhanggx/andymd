import { describe, it, expect } from 'vitest';
import {
  CODE_FONT_PRESETS,
  DEFAULT_CODE_FONT_FAMILY,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_PRESET_ID,
  FONT_PRESETS,
  clampFontSize,
  clampLineHeight,
  findCodeFontPreset,
  findFontPreset,
  normalizeCustomFamily,
} from './fonts';
import { DEFAULT_CONFIG } from '../types';

describe('font presets', () => {
  it('have unique ids and end with a generic family', () => {
    const ids = FONT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of FONT_PRESETS) {
      expect(p.family.split(',').pop()!.trim()).toMatch(/^(serif|sans-serif|monospace)$/);
    }
    for (const p of CODE_FONT_PRESETS) {
      expect(p.family.split(',').pop()!.trim()).toBe('monospace');
    }
  });

  it('ship the book serif pairing as the default body font', () => {
    const def = findFontPreset(DEFAULT_FONT_FAMILY);
    expect(def?.id).toBe(DEFAULT_FONT_PRESET_ID);
    expect(def!.family).toContain('Charter');
    expect(def!.family).toContain('Songti SC');
    expect(DEFAULT_CONFIG.fontFamily).toBe(DEFAULT_FONT_FAMILY);
    expect(DEFAULT_CONFIG.codeFontFamily).toBe(DEFAULT_CODE_FONT_FAMILY);
  });

  it('matches a stored family back to its preset ignoring quotes/case/spacing', () => {
    const p = FONT_PRESETS[1];
    const messy = p.family.split(',').map((s) => s.trim().replace(/"/g, "'").toUpperCase()).join(' ,');
    expect(findFontPreset(messy)?.id).toBe(p.id);
    expect(findFontPreset('Comic Sans MS, cursive')).toBeUndefined();
    expect(findCodeFontPreset(DEFAULT_CODE_FONT_FAMILY)?.id).toBe('system-mono');
  });
});

describe('normalizeCustomFamily', () => {
  it('quotes multi-word names and appends a generic fallback', () => {
    expect(normalizeCustomFamily('LXGW WenKai')).toBe('"LXGW WenKai", sans-serif');
    expect(normalizeCustomFamily('Georgia, Songti SC', 'serif')).toBe('Georgia, "Songti SC", serif');
  });
  it('keeps an existing generic tail and strips stray quotes', () => {
    expect(normalizeCustomFamily('"Fira Code", monospace')).toBe('"Fira Code", monospace');
    expect(normalizeCustomFamily("'Menlo' , serif")).toBe('Menlo, serif');
  });
  it('falls back to the generic family on empty input', () => {
    expect(normalizeCustomFamily('   ', 'monospace')).toBe('monospace');
  });
});

describe('clamps', () => {
  it('bound size and line height to the slider ranges', () => {
    expect(clampFontSize(3)).toBe(12);
    expect(clampFontSize(99)).toBe(28);
    expect(clampFontSize(16.4)).toBe(16);
    expect(clampLineHeight(0.5)).toBe(1.3);
    expect(clampLineHeight(5)).toBe(2.2);
    expect(clampLineHeight(1.72)).toBe(1.7);
  });
});
