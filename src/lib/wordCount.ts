// CJK scripts have no word-separating spaces; count each character as a word,
// matching the convention of Typora and the VS Code word counter.
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;

export function wordCount(text: string): { words: number; chars: number } {
  const chars = text.length;
  const cjkChars = text.match(CJK)?.length ?? 0;
  const otherWords = text
    .replace(CJK, ' ')
    .split(/\s+/)
    .filter((seg) => /[\p{L}\p{N}]/u.test(seg)).length;
  return { words: cjkChars + otherWords, chars };
}
