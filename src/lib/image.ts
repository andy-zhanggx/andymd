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
