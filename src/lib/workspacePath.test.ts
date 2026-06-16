import { describe, it, expect } from 'vitest';
import { isPathInside } from './workspacePath';

describe('isPathInside', () => {
  it('matches files within the root', () => {
    expect(isPathInside('/vault/a.md', '/vault')).toBe(true);
    expect(isPathInside('/vault/sub/b.md', '/vault')).toBe(true);
  });

  it('treats the root itself as inside', () => {
    expect(isPathInside('/vault', '/vault')).toBe(true);
  });

  it('rejects files outside the root', () => {
    expect(isPathInside('/other/a.md', '/vault')).toBe(false);
    expect(isPathInside('/vault-2/a.md', '/vault')).toBe(false); // prefix but not a child
  });

  it('tolerates a trailing slash on the root', () => {
    expect(isPathInside('/vault/a.md', '/vault/')).toBe(true);
  });

  it('is false for an empty root', () => {
    expect(isPathInside('/vault/a.md', '')).toBe(false);
  });
});
