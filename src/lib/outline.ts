import { lenifyHeadings } from './markdown';

export interface Heading {
  level: number; // 1..6
  text: string; // display text, inline markdown stripped
  /** Zero-based position among all headings, matching DOM heading order. */
  index: number;
}

/** Strip common inline markdown so outline labels read cleanly. */
export function stripInline(s: string): string {
  return s
    .replace(/!?\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_m, t, a) => a || t) // wikilinks
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links / images
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\*\*([^*]+)\*\*/g, '$1') // bold
    .replace(/\*([^*]+)\*/g, '$1') // italic
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1') // strikethrough
    .replace(/==([^=]+)==/g, '$1') // highlight
    .trim();
}

/**
 * Parse ATX headings into a flat outline. Fenced code blocks are skipped so
 * `# comment` lines inside code don't appear. Heading order matches the order
 * ProseMirror renders <h1..h6>, so `index` can drive scroll-to-heading.
 */
export function parseOutline(markdown: string): Heading[] {
  const lines = lenifyHeadings(markdown).split('\n');
  const out: Heading[] = [];
  let inFence = false;
  let fenceChar = '';
  let index = 0;

  for (const line of lines) {
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const ch = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = ch;
      } else if (ch === fenceChar) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    const m = line.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (m) {
      out.push({ level: m[1].length, text: stripInline(m[2]), index: index++ });
    }
  }
  return out;
}
