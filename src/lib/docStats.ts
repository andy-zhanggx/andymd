import { wordCount } from './wordCount';

export interface DocStats {
  words: number;
  chars: number;
  charsNoSpaces: number;
  lines: number;
  readingTimeMin: number; // rounded up, min 1 when there are words
}

const WORDS_PER_MIN = 200;

/** Aggregate document statistics for the status-bar detail popover. */
export function docStats(text: string): DocStats {
  const { words, chars } = wordCount(text);
  const charsNoSpaces = text.replace(/\s/g, '').length;
  // An empty string has 0 lines; otherwise count newline-separated lines.
  const lines = text.length === 0 ? 0 : text.split('\n').length;
  const readingTimeMin = words === 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MIN));
  return { words, chars, charsNoSpaces, lines, readingTimeMin };
}
