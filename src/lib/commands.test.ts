import { describe, it, expect, beforeEach } from 'vitest';
import { COMMANDS, filterCommands, loadRecentCommands, rememberCommand, type Command } from './commands';

const cmds: Command[] = [
  { id: 'a', title: 'Toggle Sidebar', category: 'View' },
  { id: 'b', title: 'Search in Workspace…', category: 'Vault', keywords: 'find all' },
  { id: 'c', title: 'Find…', category: 'Edit', keywords: 'search' },
  { id: 'd', title: 'Toggle Focus Mode', category: 'View' },
];

describe('filterCommands', () => {
  it('matches all words across title, category and keywords', () => {
    expect(filterCommands(cmds, 'view focus').map((c) => c.id)).toEqual(['d']);
    expect(filterCommands(cmds, 'find all').map((c) => c.id)).toEqual(['b']);
  });
  it('ranks title-prefix matches first', () => {
    expect(filterCommands(cmds, 'find').map((c) => c.id)).toEqual(['c', 'b']);
    expect(filterCommands(cmds, 'search').map((c) => c.id)).toEqual(['b', 'c']);
  });
  it('leads with recent commands when the query is empty', () => {
    expect(filterCommands(cmds, '', ['d', 'zz']).map((c) => c.id)).toEqual(['d', 'a', 'b', 'c']);
  });
  it('catalogue ids are unique', () => {
    const ids = COMMANDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('recent commands', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Storage;
  });
  it('keeps the five most recent, most recent first, without duplicates', () => {
    for (const id of ['1', '2', '3', '2', '4', '5', '6']) rememberCommand(id);
    expect(loadRecentCommands()).toEqual(['6', '5', '4', '2', '3']);
  });
});

describe('catalogue wiring', () => {
  it('every command id is handled by handleMenuAction', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../hooks/useShortcuts.ts', import.meta.url), 'utf8');
    const handled = new Set([...src.matchAll(/case '([^']+)':/g)].map((m) => m[1]));
    const missing = COMMANDS.map((c) => c.id).filter((id) => !handled.has(id));
    expect(missing).toEqual([]);
  });
});
