// Recognised raster/vector image extensions that we import on drop.
export const IMAGE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'svg',
  'bmp',
  'avif',
  'ico',
  'tif',
  'tiff',
] as const;

export function isImagePath(path: string): boolean {
  const clean = path.split('?')[0]?.split('#')[0] ?? '';
  const dot = clean.lastIndexOf('.');
  if (dot < 0) return false;
  const ext = clean.slice(dot + 1).toLowerCase();
  return (IMAGE_EXTENSIONS as readonly string[]).includes(ext);
}

export function filterImagePaths(paths: string[]): string[] {
  return paths.filter(isImagePath);
}

/** A dropped File is an image if its MIME type or filename says so. */
export function isImageFile(file: { name: string; type: string }): boolean {
  return file.type.startsWith('image/') || isImagePath(file.name);
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/avif': 'avif',
  'image/tiff': 'tif',
};

/**
 * Name for a clipboard-pasted image. Screenshots arrive as a generic
 * `image.png`, so those get a timestamped name (the Rust importer dedupes
 * collisions); a real filename (copied from Finder) is kept as-is.
 */
export function pastedImageName(file: { name: string; type: string }, now: Date): string {
  const generic = !file.name || /^image(\.[a-z0-9]+)?$/i.test(file.name);
  if (!generic) return file.name;
  const pad = (n: number) => String(n).padStart(2, '0');
  const ts =
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `pasted-${ts}.${MIME_EXT[file.type] ?? 'png'}`;
}

/**
 * Image files to import from a paste, or `[]` when the paste should fall
 * through to the editor. Pastes that also carry text (a table copied from a
 * spreadsheet renders as both) keep their text meaning.
 */
export function imagesFromPaste(dt: {
  files?: ArrayLike<File>;
  getData?: (type: string) => string;
} | null): File[] {
  if (!dt) return [];
  const images = Array.from(dt.files ?? []).filter(isImageFile);
  if (images.length === 0) return [];
  if ((dt.getData?.('text/plain') ?? '').trim()) return [];
  return images;
}
