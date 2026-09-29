import { describe, it, expect, vi, beforeEach } from 'vitest';

const semanticSearch = vi.fn();
const semanticRelated = vi.fn();
vi.mock('../services/fsService', () => ({ fsService: { semanticSearch, semanticRelated } }));

const status = { root: '/v', phase: 'ready', done: 0, total: 0, files: 3, chunks: 5, message: null };
const hit = (path: string, score: number) => ({ path, relPath: path.slice(3), heading: '', line: 1, snippet: '', score });

beforeEach(() => {
  vi.resetModules();
  semanticSearch.mockReset();
  semanticRelated.mockReset();
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  } as Storage;
});

describe('relatedStore', () => {
  it('asks for related notes of the note or its section', async () => {
    const { useRelatedStore } = await import('./relatedStore');
    semanticRelated.mockResolvedValue({ status, hits: [hit('/v/b.md', 0.8)] });
    await useRelatedStore.getState().refreshRelated('/v', '/v/a.md', 12);
    expect(semanticRelated).toHaveBeenCalledWith('/v', '/v/a.md', 12, 20);
    expect(useRelatedStore.getState().hits.map((h) => h.path)).toEqual(['/v/b.md']);
  });

  it('suggests links for long paragraphs only, and remembers dismissals', async () => {
    const { useRelatedStore } = await import('./relatedStore');
    const s = useRelatedStore.getState();
    await s.refreshSuggestions('/v', '/v/a.md', 'too short', new Set());
    expect(semanticSearch).not.toHaveBeenCalled();

    semanticSearch.mockResolvedValue({ status, hits: [hit('/v/b.md', 0.8), hit('/v/c.md', 0.7), hit('/v/d.md', 0.2)] });
    const para = 'A paragraph that is long enough to be worth a semantic lookup.';
    await s.refreshSuggestions('/v', '/v/a.md', para, new Set(['/v/c.md']));
    expect(useRelatedStore.getState().suggestions.map((x) => x.path)).toEqual(['/v/b.md']);

    useRelatedStore.getState().dismiss('/v/a.md', '/v/b.md');
    expect(useRelatedStore.getState().suggestions).toEqual([]);
    await useRelatedStore.getState().refreshSuggestions('/v', '/v/a.md', para, new Set());
    expect(useRelatedStore.getState().suggestions.map((x) => x.path)).toEqual(['/v/c.md']);

    // Dismissals survive a reload of the store.
    vi.resetModules();
    const again = await import('./relatedStore');
    expect([...again.useRelatedStore.getState().dismissed]).toHaveLength(1);
  });
});
