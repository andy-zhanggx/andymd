import { convertFileSrc } from '@tauri-apps/api/core';

export function toAssetUrl(fsPath: string): string {
  return convertFileSrc(fsPath);
}

export function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function dirname(path: string): string {
  const index = path.lastIndexOf('/');
  if (index < 0) return '';
  if (index === 0) return '/';
  return path.slice(0, index);
}

export function resolvePosixPath(path: string): string {
  const absolute = path.startsWith('/');
  const parts: string[] = [];

  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      if (parts.length > 0) {
        parts.pop();
      } else if (!absolute) {
        parts.push(part);
      }
      continue;
    }
    parts.push(part);
  }

  const resolved = parts.join('/');
  if (absolute) return `/${resolved}`;
  return resolved || '.';
}

export function resolveImageSrc(src: string, docPath: string | null): string {
  if (!src) return src;
  if (/^(https?:\/\/|data:|asset:|file:)/i.test(src)) return src;

  // Strip query and fragment before treating as filesystem path.
  const noQuery = src.split('?')[0] ?? '';
  const pathPart = noQuery.split('#')[0] ?? '';
  if (!pathPart) return src;

  // Decode percent-encoded characters once. CommonMark/Milkdown emits
  // already-encoded srcs (%20, %E4%B8%AD...); convertFileSrc will encode
  // again — so we need to decode first to avoid double-encoding.
  const decoded = decodePath(pathPart);

  if (decoded.startsWith('/')) {
    return toAssetUrl(resolvePosixPath(decoded));
  }
  if (!docPath) return src;

  const joined = `${dirname(docPath)}/${decoded}`;
  return toAssetUrl(resolvePosixPath(joined));
}

export type ResolvedLink =
  | { kind: 'external'; href: string }
  | { kind: 'mdfile'; absPath: string }
  | { kind: 'ignore' };

export function resolveLinkHref(href: string, docPath: string | null): ResolvedLink {
  if (/^(https?:\/\/|mailto:)/i.test(href)) return { kind: 'external', href };

  const pathPart = href.split('#')[0];
  if (!pathPart) return { kind: 'ignore' };

  const decodedPath = decodePath(pathPart);
  const absPath = decodedPath.startsWith('/')
    ? resolvePosixPath(decodedPath)
    : docPath
      ? resolvePosixPath(`${dirname(docPath)}/${decodedPath}`)
      : null;

  if (!absPath || !/\.md$/i.test(absPath)) return { kind: 'ignore' };
  return { kind: 'mdfile', absPath };
}
