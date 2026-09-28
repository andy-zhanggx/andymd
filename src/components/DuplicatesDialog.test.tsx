// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const semanticDuplicates = vi.fn(async (_root: string, threshold: number) => ({
  status: {},
  pairs:
    threshold <= 0.92
      ? [{ a: '/v/a.md', aRel: 'a.md', b: '/v/a copy.md', bRel: 'a copy.md', score: 0.97 }]
      : [],
}));
vi.mock('../services/fsService', () => ({ fsService: { semanticDuplicates } }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));

describe('DuplicatesDialog', () => {
  it('lists near-duplicate pairs for the chosen level', async () => {
    const { useUIStore } = await import('../stores/uiStore');
    const { useWorkspaceStore } = await import('../stores/workspaceStore');
    const { useConfigStore } = await import('../stores/configStore');
    const { useSemanticStore } = await import('../stores/semanticStore');
    const { DuplicatesDialog } = await import('./DuplicatesDialog');
    useWorkspaceStore.setState({
      workspace: { root: '/v', name: 'v', tree: { path: '/v', name: 'v', kind: 'dir', children: [] }, expandedPaths: new Set() },
    });
    useConfigStore.setState((s) => ({ config: { ...s.config, semanticSearch: true } }));
    useSemanticStore.setState({
      status: { root: '/v', phase: 'ready', done: 0, total: 0, files: 3, chunks: 3, message: null },
    });
    useUIStore.setState({ duplicatesOpen: true });

    const host = document.createElement('div');
    const root = createRoot(host);
    await act(async () => root.render(<DuplicatesDialog />));
    await vi.waitFor(() => expect(host.textContent).toContain('a copy.md'));
    expect(host.textContent).toContain('97%');
    expect(semanticDuplicates).toHaveBeenCalledWith('/v', 0.92);

    const near = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Near-identical')!;
    await act(async () => near.click());
    await vi.waitFor(() => expect(host.textContent).toContain('No duplicate notes at this level'));
    act(() => root.unmount());
  });
});
