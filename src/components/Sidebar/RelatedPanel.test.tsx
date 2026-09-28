// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function renderHtml(el: React.ReactElement): string {
  const host = document.createElement('div');
  const root = createRoot(host);
  act(() => root.render(el));
  const html = host.innerHTML;
  act(() => root.unmount());
  return html;
}

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (p: string) => p }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));

const ready = { root: '/v', phase: 'ready' as const, done: 0, total: 0, files: 2, chunks: 4, message: null };

async function setup(opts: { root?: string | null; enabled?: boolean; phase?: 'ready' | 'indexing' }) {
  const { useWorkspaceStore } = await import('../../stores/workspaceStore');
  const { useConfigStore } = await import('../../stores/configStore');
  const { useSemanticStore } = await import('../../stores/semanticStore');
  const { useDocumentStore } = await import('../../stores/documentStore');
  const root = opts.root === undefined ? '/v' : opts.root;
  useWorkspaceStore.setState({
    workspace: root ? { root, name: 'v', tree: { path: root, name: 'v', kind: 'dir', children: [] }, expandedPaths: new Set() } : null,
  });
  useConfigStore.setState((s) => ({ config: { ...s.config, semanticSearch: opts.enabled ?? true } }));
  useSemanticStore.setState({ status: { ...ready, phase: opts.phase ?? 'ready', total: 10, done: 3 } });
  useDocumentStore.setState({
    doc: { path: '/v/a.md', content: '', draft: '', isDirty: false, mtime: 0, encoding: 'utf-8' },
  } as never);
  const { RelatedPanel } = await import('./RelatedPanel');
  return () => renderHtml(<RelatedPanel />);
}

beforeEach(async () => {
  const { useRelatedStore } = await import('../../stores/relatedStore');
  useRelatedStore.setState({ hits: [], suggestions: [], loading: false, mode: 'note' });
});

describe('RelatedPanel', () => {
  it('asks for a folder, then for consent', async () => {
    expect((await setup({ root: null }))()).toContain('Open a folder');
    expect((await setup({ enabled: false }))()).toContain('Search by meaning');
  });

  it('shows indexing progress until the index is ready', async () => {
    expect((await setup({ phase: 'indexing' }))()).toContain('Indexing workspace');
  });

  it('lists link suggestions and related notes', async () => {
    const render = await setup({});
    const { useRelatedStore } = await import('../../stores/relatedStore');
    useRelatedStore.setState({
      hits: [{ path: '/v/b.md', relPath: 'b.md', heading: 'Part', line: 3, snippet: 'about b', score: 0.8 }],
      suggestions: [{ path: '/v/c.md', relPath: 'c.md', heading: 'Intro', snippet: 'c', score: 0.7 }],
    });
    const html = render();
    expect(html).toContain('Link this paragraph to');
    expect(html).toContain('>c<');
    expect(html).toContain('Related notes');
    expect(html).toContain('about b');
    expect(html).toContain('Find duplicate notes');
  });
});
