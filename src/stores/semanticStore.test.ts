import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.hoisted(() => ({
  semanticStart: vi.fn(async () => {}),
  semanticStatus: vi.fn(),
  semanticSearch: vi.fn(),
}));

vi.mock('../services/fsService', () => ({
  fsService: invoke,
  onSemanticStatus: vi.fn(async () => () => {}),
}));

vi.mock('../services/configService', () => ({
  configService: { load: vi.fn(async () => ({})), save: vi.fn(async () => {}) },
}));

vi.mock('../services/menuService', () => ({
  menuService: { syncRecentMenu: vi.fn(async () => {}) },
}));

import { useSemanticStore } from './semanticStore';
import { useConfigStore } from './configStore';
import { OFF_STATUS, type SemanticHit } from '../lib/semantic';

const ready = { ...OFF_STATUS, root: '/v', phase: 'ready' as const, files: 2, chunks: 3 };
const hit = (path: string, score: number): SemanticHit => ({
  path,
  relPath: path.slice(3),
  heading: 'H',
  line: 1,
  snippet: 's',
  score,
});

beforeEach(() => {
  invoke.semanticStart.mockClear();
  invoke.semanticSearch.mockReset();
  useSemanticStore.setState({ status: OFF_STATUS, query: '', hits: [], searching: false });
  useConfigStore.setState({
    config: { ...useConfigStore.getState().config, semanticSearch: false, semanticModelEndpoint: '' },
    loaded: true,
  });
});

describe('semanticStore', () => {
  it('start passes the configured mirror (or null) to the backend', async () => {
    await useSemanticStore.getState().start('/v');
    expect(invoke.semanticStart).toHaveBeenLastCalledWith('/v', null);

    useConfigStore.setState({
      config: { ...useConfigStore.getState().config, semanticModelEndpoint: ' https://hf-mirror.com ' },
    });
    await useSemanticStore.getState().start('/v');
    expect(invoke.semanticStart).toHaveBeenLastCalledWith('/v', 'https://hf-mirror.com');
  });

  it('enable persists the opt-in and starts indexing', async () => {
    await useSemanticStore.getState().enable('/v', 'https://hf-mirror.com');
    const cfg = useConfigStore.getState().config;
    expect(cfg.semanticSearch).toBe(true);
    expect(cfg.semanticModelEndpoint).toBe('https://hf-mirror.com');
    expect(invoke.semanticStart).toHaveBeenCalledWith('/v', 'https://hf-mirror.com');
  });

  it('search stores hits and the returned status; empty query clears', async () => {
    invoke.semanticSearch.mockResolvedValue({ status: ready, hits: [hit('/v/a.md', 0.8)] });
    await useSemanticStore.getState().search('/v', '  recall  ');
    const s = useSemanticStore.getState();
    expect(invoke.semanticSearch).toHaveBeenCalledWith('/v', 'recall');
    expect(s.query).toBe('recall');
    expect(s.hits).toHaveLength(1);
    expect(s.status.phase).toBe('ready');
    expect(s.searching).toBe(false);

    await useSemanticStore.getState().search('/v', '   ');
    expect(useSemanticStore.getState().hits).toEqual([]);
    expect(useSemanticStore.getState().query).toBe('');
  });

  it('a slow stale search never overwrites a newer one', async () => {
    let resolveFirst!: (v: unknown) => void;
    invoke.semanticSearch
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ status: ready, hits: [hit('/v/b.md', 0.9)] });
    const first = useSemanticStore.getState().search('/v', 'one');
    await useSemanticStore.getState().search('/v', 'two');
    resolveFirst({ status: ready, hits: [hit('/v/a.md', 0.5)] });
    await first;
    expect(useSemanticStore.getState().hits[0].path).toBe('/v/b.md');
  });

  it('re-runs the pending query when the index becomes ready', async () => {
    invoke.semanticSearch.mockResolvedValue({
      status: { ...OFF_STATUS, root: '/v', phase: 'indexing' },
      hits: [],
    });
    await useSemanticStore.getState().search('/v', 'recall');
    expect(useSemanticStore.getState().hits).toEqual([]);

    invoke.semanticSearch.mockResolvedValue({ status: ready, hits: [hit('/v/a.md', 0.7)] });
    useSemanticStore.getState().onStatus(ready);
    await new Promise((r) => setTimeout(r, 0));
    expect(useSemanticStore.getState().hits).toHaveLength(1);
    expect(invoke.semanticSearch).toHaveBeenCalledTimes(2);

    // Already-ready status updates (e.g. refresh counts) don't re-search.
    useSemanticStore.getState().onStatus({ ...ready, files: 3 });
    await new Promise((r) => setTimeout(r, 0));
    expect(invoke.semanticSearch).toHaveBeenCalledTimes(2);
  });
});
