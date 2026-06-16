/**
 * True when `filePath` lives inside the directory `root` (or is `root` itself).
 * Both are absolute POSIX paths. Used to decide whether opening a file should
 * keep the current workspace or switch the sidebar to the file's vault.
 */
export function isPathInside(filePath: string, root: string): boolean {
  if (!root) return false;
  const base = root.replace(/\/+$/, '');
  return filePath === base || filePath.startsWith(`${base}/`);
}
