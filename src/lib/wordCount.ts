export function wordCount(text: string): { words: number; chars: number } {
  const chars = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return { words, chars };
}
