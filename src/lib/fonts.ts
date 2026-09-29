// Curated editor font presets. Every stack is built from fonts that ship with
// macOS (the only platform we release on) plus popular optional fonts placed
// first so they take over automatically when installed. Each stack pairs a
// Latin face with a CJK companion of matching flavour, because the vaults this
// editor is tuned for mix Chinese and English on the same line.

export interface FontPreset {
  id: string;
  /** Short display name. */
  label: string;
  /** One-line description shown under the label. */
  description: string;
  /** The CSS `font-family` value stored in config. */
  family: string;
}

export const FONT_PRESETS: readonly FontPreset[] = [
  {
    id: 'book',
    label: 'Book — Charter + Songti',
    description: 'Matthew Carter’s Charter with Songti. Reads most like a printed book.',
    family:
      'Charter, "Iowan Old Style", Georgia, "Songti SC", "Noto Serif CJK SC", "Source Han Serif SC", serif',
  },
  {
    id: 'kai',
    label: 'Kai — Kaiti / LXGW WenKai',
    description: 'Calligraphic Kaiti. Uses LXGW WenKai automatically when installed.',
    family:
      '"LXGW WenKai Screen", "LXGW WenKai", "Kaiti SC", STKaiti, "Iowan Old Style", Georgia, serif',
  },
  {
    id: 'system',
    label: 'System — San Francisco + PingFang',
    description: 'The macOS interface fonts. Neutral and compact.',
    family:
      '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
  },
  {
    id: 'humanist',
    label: 'Humanist — Avenir Next + Hiragino Sans',
    description: 'Geometric Avenir Next with Hiragino Sans GB. Bright but not stiff.',
    family:
      '"Avenir Next", Avenir, "Hiragino Sans GB", "PingFang SC", "Helvetica Neue", sans-serif',
  },
  {
    id: 'classic',
    label: 'Classic — New York + Songti',
    description: 'Apple’s New York serif. Shines at larger sizes.',
    family: 'ui-serif, "New York", "Iowan Old Style", Georgia, "Songti SC", serif',
  },
];

/** Preset the app ships with — a serif pairing that reads like a book. */
export const DEFAULT_FONT_PRESET_ID = 'book';

export const DEFAULT_FONT_FAMILY = FONT_PRESETS.find((p) => p.id === DEFAULT_FONT_PRESET_ID)!.family;

/** Monospace stack for code spans and fenced blocks. */
export const DEFAULT_CODE_FONT_FAMILY =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, monospace';

export interface CodeFontPreset {
  id: string;
  label: string;
  family: string;
}

export const CODE_FONT_PRESETS: readonly CodeFontPreset[] = [
  { id: 'system-mono', label: 'SF Mono (System)', family: DEFAULT_CODE_FONT_FAMILY },
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    family: '"JetBrains Mono", "JetBrainsMono Nerd Font", "JetBrainsMonoNL Nerd Font", ui-monospace, Menlo, monospace',
  },
  { id: 'fira', label: 'Fira Code', family: '"Fira Code", "Fira Mono", ui-monospace, Menlo, monospace' },
  { id: 'menlo', label: 'Menlo', family: 'Menlo, Monaco, Consolas, monospace' },
];

/** Canonical form used to compare two font-family values. */
function normalizeFamily(family: string): string {
  return family
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, '').toLowerCase())
    .filter(Boolean)
    .join(',');
}

/** Find the preset whose stack matches `family`, or undefined for a custom value. */
export function findFontPreset(family: string): FontPreset | undefined {
  const key = normalizeFamily(family);
  return FONT_PRESETS.find((p) => normalizeFamily(p.family) === key);
}

export function findCodeFontPreset(family: string): CodeFontPreset | undefined {
  const key = normalizeFamily(family);
  return CODE_FONT_PRESETS.find((p) => normalizeFamily(p.family) === key);
}

/**
 * Turn a user-typed family name into a valid `font-family` value: quote names
 * containing spaces, keep generic keywords bare, and always end with a
 * generic fallback so a typo never collapses to the browser default serif.
 */
const GENERIC_FAMILIES = new Set([
  'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
  'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'inherit',
]);

export function normalizeCustomFamily(input: string, fallback = 'sans-serif'): string {
  const parts = input
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean)
    .map((name) =>
      GENERIC_FAMILIES.has(name.toLowerCase()) || /^[\w-]+$/.test(name) ? name : `"${name}"`,
    );
  if (parts.length === 0) return fallback;
  const last = parts[parts.length - 1].toLowerCase();
  if (!GENERIC_FAMILIES.has(last)) parts.push(fallback);
  return parts.join(', ');
}

export const FONT_SIZE_MIN = 12;
export const FONT_SIZE_MAX = 28;
export const LINE_HEIGHT_MIN = 1.3;
export const LINE_HEIGHT_MAX = 2.2;

export const clampFontSize = (n: number) =>
  Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(n)));
export const clampLineHeight = (n: number) =>
  Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, Math.round(n * 20) / 20));
