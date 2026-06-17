/**
 * Pure decision logic for auto-pairing brackets and quotes, shared by the
 * editor plugin and its unit tests.
 */

const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '"': '"',
  "'": "'",
};
const CLOSERS = new Set(Object.values(PAIRS));

export function openerClose(ch: string): string | null {
  return PAIRS[ch] ?? null;
}
export function isCloser(ch: string): boolean {
  return CLOSERS.has(ch);
}

export type PairDecision =
  | { kind: 'wrap'; open: string; close: string }
  | { kind: 'close'; open: string; close: string }
  | { kind: 'skip' }
  | null;

const isQuoteChar = (c: string) => c === '"' || c === "'";

/**
 * Decide what should happen when `text` is typed.
 * - `wrap`  — there is a selection; wrap it in the pair
 * - `close` — insert the pair and place the caret between
 * - `skip`  — caret is just before the same closer; step over it
 * - `null`  — do nothing special
 *
 * Quotes only auto-close at a word boundary (start / after space or opener) so
 * apostrophes inside words ("don't") aren't doubled.
 */
export function decidePair(
  text: string,
  selectionEmpty: boolean,
  charBefore: string,
  charAfter: string,
): PairDecision {
  const close = openerClose(text);

  // Step over a closer the user is "typing through".
  if (selectionEmpty && charAfter === text && (isCloser(text) || isQuoteChar(text))) {
    return { kind: 'skip' };
  }

  if (close) {
    if (!selectionEmpty) return { kind: 'wrap', open: text, close };
    if (isQuoteChar(text)) {
      const ok = charBefore === '' || /\s/.test(charBefore) || /[([{]/.test(charBefore);
      if (!ok) return null;
    }
    return { kind: 'close', open: text, close };
  }

  return null;
}
