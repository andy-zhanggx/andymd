import { convertFileSrc } from '@tauri-apps/api/core';

export function toAssetUrl(fsPath: string): string {
  return convertFileSrc(fsPath);
}

export function resolveImageSrc(src: string, docPath: string | null): string {
  if (!src) return src;
  if (/^(https?:|data:|asset:)/.test(src)) return src;
  if (!docPath) return src;
  const dir = docPath.replace(/[^/]+$/, '');
  const abs = src.startsWith('/') ? src : dir + src;
  return toAssetUrl(abs);
}
