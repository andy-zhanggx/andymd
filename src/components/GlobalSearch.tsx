import { useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentStore } from '../stores/documentStore';
import { fsService } from '../services/fsService';
import { getActiveView } from './Editor/activeView';
import { setSearch } from './Editor/searchPlugin';
import {
  EMPTY_RESULTS,
  countMatches,
  flattenResults,
  highlightSegments,
  type SearchResults,
} from '../lib/globalSearch';

const DEBOUNCE_MS = 200;

/**
 * After a result opens, highlight the query in the (possibly rebuilt) editor.
 * The editor view is torn down and re-created asynchronously when the active
 * document changes, so poll until the view instance changes (or a short
 * deadline passes) before painting the search highlights.
 */
function revealInEditor(query: string, prevView: unknown) {
  const deadline = Date.now() + 2000;
  const tick = () => {
    const view = getActiveView();
    if (view && (view !== prevView || Date.now() > deadline - 1500)) {
      try {
        setSearch(view, query, false);
      } catch {
        // The view can be mid-teardown during a rebuild; highlights are a
        // nicety, never worth surfacing an error for.
      }
      return;
    }
    if (Date.now() < deadline) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function GlobalSearch() {
  const open = useUIStore((s) => s.globalSearchOpen);
  const setOpen = useUIStore((s) => s.setGlobalSearchOpen);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openDoc = useDocumentStore((s) => s.open);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS);
  const [searching, setSearching] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Result generation counter so a slow stale search never overwrites a newer one.
  const genRef = useRef(0);

  const rows = useMemo(() => flattenResults(results), [results]);
  const total = countMatches(results);

  useEffect(() => {
    if (open) {
      setActive(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [open]);

  // Debounced search against the Rust scanner.
  useEffect(() => {
    if (!open) return;
    const root = workspace?.root;
    const gen = ++genRef.current;
    if (!root || !query.trim()) {
      setResults(EMPTY_RESULTS);
      setSearching(false);
      return;
    }
    setSearching(true);
    const id = window.setTimeout(async () => {
      try {
        const res = await fsService.searchWorkspace(root, query);
        if (genRef.current === gen) {
          setResults(res);
          setActive(0);
        }
      } catch (err) {
        console.warn('workspace search failed', err);
        if (genRef.current === gen) setResults(EMPTY_RESULTS);
      } finally {
        if (genRef.current === gen) setSearching(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [open, query, workspace]);

  // Keep the active row visible while navigating with the keyboard.
  useEffect(() => {
    const el = listRef.current?.querySelector('.gsearch-item.active');
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const close = () => setOpen(false);

  const activate = async (row: { path: string }) => {
    const prevView = getActiveView();
    close();
    await openDoc(row.path);
    revealInEditor(query, prevView);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const row = rows[active];
      if (row) void activate(row);
    }
  };

  // Group rows back by file for rendering while keeping flat indices for
  // keyboard navigation.
  let rowIndex = -1;

  return (
    <div className="quickopen-backdrop" onMouseDown={close}>
      <div
        className="quickopen gsearch"
        role="dialog"
        aria-label="Search in workspace"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="quickopen-input"
          placeholder={workspace ? 'Search in workspace…' : 'Open a folder to search'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="quickopen-list gsearch-list" ref={listRef}>
          {rows.length === 0 && (
            <div className="quickopen-empty">
              {!workspace
                ? 'No folder open'
                : !query.trim()
                  ? 'Type to search all notes'
                  : searching
                    ? 'Searching…'
                    : 'No matches'}
            </div>
          )}
          {results.files.map((file) => (
            <div key={file.path} className="gsearch-file">
              <div className="gsearch-filehead" title={file.relPath}>
                <span className="gsearch-filename">{file.relPath}</span>
                <span className="gsearch-count">
                  {file.matches.length}
                  {file.truncated ? '+' : ''}
                </span>
              </div>
              {file.matches.map((m) => {
                rowIndex += 1;
                const i = rowIndex;
                return (
                  <div
                    key={`${file.path}:${m.line}`}
                    className={i === active ? 'quickopen-item gsearch-item active' : 'quickopen-item gsearch-item'}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => void activate(rows[i])}
                  >
                    <span className="gsearch-line">{m.line}</span>
                    <span className="gsearch-text">
                      {highlightSegments(m.text, query).map((seg, k) =>
                        seg.hit ? (
                          <mark key={k} className="gsearch-hit">
                            {seg.text}
                          </mark>
                        ) : (
                          <span key={k}>{seg.text}</span>
                        ),
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="quickopen-footer">
          <span className="quickopen-hint">
            {total > 0
              ? `${total}${results.truncated ? '+' : ''} matches in ${results.files.length} files · ↑↓ navigate · ↵ open`
              : '↑↓ navigate · ↵ open · esc close'}
          </span>
        </div>
      </div>
    </div>
  );
}
