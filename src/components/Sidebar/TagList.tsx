import { useEffect, useMemo, useState } from 'react';
import { fsService, onSearchIndexReady, onWorkspaceChanged, type TagCount } from '../../services/fsService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { showTag } from '../../lib/tagActions';

const REFRESH_MS = 600;

/**
 * Sidebar "Tags" tab: every `#tag` in the vault with how many notes carry
 * it, read from the Rust search index (kept fresh by the file watcher).
 * Clicking a tag filters the file tree to its notes.
 */
export function TagList() {
  const root = useWorkspaceStore((s) => s.workspace?.root ?? null);
  const [tags, setTags] = useState<TagCount[] | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!root) return;
    let cancelled = false;
    let timer: number | null = null;
    const load = async () => {
      try {
        const res = await fsService.listTags(root);
        if (!cancelled) setTags(res.ready ? res.tags : null);
      } catch {
        if (!cancelled) setTags([]);
      }
    };
    const later = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void load(), REFRESH_MS);
    };
    void load();
    const offs: Promise<() => void>[] = [
      onSearchIndexReady((r) => r === root && void load()),
      onWorkspaceChanged(later),
    ];
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      offs.forEach((p) => void p.then((off) => off()).catch(() => {}));
    };
  }, [root]);

  const shown = useMemo(() => {
    const q = filter.trim().replace(/^#/, '').toLowerCase();
    return (tags ?? []).filter((t) => !q || t.tag.toLowerCase().includes(q));
  }, [tags, filter]);

  if (!root) {
    return (
      <div className="sidebar-empty">
        <p>No folder open</p>
      </div>
    );
  }
  if (tags === null) {
    return (
      <div className="sidebar-empty">
        <p>Indexing workspace…</p>
      </div>
    );
  }
  return (
    <div className="taglist">
      <input
        className="treesearch-input taglist-filter"
        type="search"
        placeholder="Filter tags…"
        aria-label="Filter tags"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      {tags.length === 0 ? (
        <p className="taglist-empty">No #tags in this vault yet.</p>
      ) : (
        <ul className="taglist-items" role="list">
          {shown.map((t) => (
            <li key={t.tag.toLowerCase()}>
              <button type="button" className="taglist-item" onClick={() => showTag(t.tag)} title={`Show notes tagged #${t.tag}`}>
                <span className="taglist-name">#{t.tag}</span>
                <span className="taglist-count">{t.count}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
