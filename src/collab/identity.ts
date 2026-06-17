// Per-user identity broadcast over awareness so collaborators see who's editing
// and each remote cursor gets a stable color + name label.

export interface CollabUser {
  name: string;
  color: string;
}

// Saturated, legible-on-both-themes palette. Index assignment is stable per
// session (see pickColor) so a user keeps the same color while connected.
export const USER_COLORS = [
  '#e5484d', // red
  '#f76808', // orange
  '#ffb224', // amber
  '#46a758', // green
  '#12a594', // teal
  '#0091ff', // blue
  '#6e56cf', // violet
  '#e93d82', // pink
];

const ADJECTIVES = ['Quick', 'Calm', 'Bright', 'Bold', 'Keen', 'Brave', 'Witty', 'Swift'];

/** Stable-ish hash for deterministic color/name fallback from an id string. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickColor(seed: string): string {
  return USER_COLORS[hash(seed) % USER_COLORS.length];
}

/** A friendly default name when the user hasn't set one in config. */
export function generateName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const n = Math.floor(Math.random() * 90) + 10;
  return `${adj}-${n}`;
}

export function resolveUser(configuredName: string | undefined, seed: string): CollabUser {
  const name = configuredName?.trim() || generateName();
  return { name, color: pickColor(seed) };
}
