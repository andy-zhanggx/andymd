import { describe, it, expect } from 'vitest';
import { pickColor, resolveUser, USER_COLORS } from './identity';

describe('identity', () => {
  it('picks a color from the palette, stably for a given seed', () => {
    const c1 = pickColor('room-1:42');
    const c2 = pickColor('room-1:42');
    expect(c1).toBe(c2); // deterministic
    expect(USER_COLORS).toContain(c1);
  });

  it('uses the configured name when provided', () => {
    const user = resolveUser('Andy', 'seed');
    expect(user.name).toBe('Andy');
    expect(USER_COLORS).toContain(user.color);
  });

  it('generates a fallback name when none configured', () => {
    expect(resolveUser('', 'seed').name).toMatch(/^[A-Za-z]+-\d+$/);
    expect(resolveUser('   ', 'seed').name).toMatch(/^[A-Za-z]+-\d+$/);
    expect(resolveUser(undefined, 'seed').name).toMatch(/^[A-Za-z]+-\d+$/);
  });

  it('trims a configured name', () => {
    expect(resolveUser('  Bob  ', 'seed').name).toBe('Bob');
  });
});
