/**
 * Relax ATX heading detection so `##text` (no space after #) is still
 * recognized as a heading — Typora-style convenience for Chinese writers
 * who don't add spaces between punctuation and content.
 */
export function lenifyHeadings(md: string): string {
  return md.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');
}
