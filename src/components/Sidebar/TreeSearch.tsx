import { useEffect, useRef, useState } from 'react';
import { fsService, onSearchIndexReady } from '../../services/fsService';
import { useSemanticStore } from '../../stores/semanticStore';
import type { TreeFilter } from '../../lib/treeFilter';

const DEBOUNCE_MS = 150;
const SEMANTIC_DEBOUNCE_MS = 300;
/** Fixed row height so the sidebar can subtract it from the tree's height. */
export const TREE_SEARCH_HEIGHT = 34;

export type SearchMode = 'filter' | 'semantic';

interface Props {
  root: string;
  /** Null when the query is empty (show the full tree). Filter mode only. */
  onFilter: (filter: TreeFilter | null) => void;
  /** Rendered under the input while a query is active (e.g. `12 files`). */
  hint?: string | null;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  /** Whether the semantic index is usable; gates the semantic query effect. */
  semanticReady: boolean;
}

/**
 * Search box above the file tree. Owns the query and either asks the Rust
 * substring index for matching files (filter mode, debounced) or runs a
 * semantic query through the semantic store. While the substring index is
 * still building it reports `indexing` and re-runs the query when the
 * `search-index-ready` event arrives.
 */
export function TreeSearch({ root, onFilter, hint, mode, onModeChange, semanticReady }: Props) {
  const [query, setQuery] = useState('');
  // Bumped when the index announces readiness so the query effect re-runs.
  const [indexEpoch, setIndexEpoch] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const genRef = useRef(0);
  const versionRef = useRef(0);
  const semanticSearch = useSemanticStore((s) => s.search);
  const semanticClear = useSemanticStore((s) => s.clear);

  useEffect(() => {
    let off: (() => void) | null = null;
    let cancelled = false;
    onSearchIndexReady((readyRoot) => {
      if (readyRoot === root) setIndexEpoch((n) => n + 1);
    })
      .then((fn) => {
        if (cancelled) fn();
        else off = fn;
      })
      .catch(() => {
        // No Tauri backend (web preview) — the filter simply stays unavailable.
      });
    return () => {
      cancelled = true;
      off?.();
    };
  }, [root]);

  // Filter mode: substring index.
  useEffect(() => {
    const gen = ++genRef.current;
    if (mode !== 'filter') {
      onFilter(null);
      return;
    }
    const q = query.trim();
    if (!q) {
      onFilter(null);
      return;
    }
    const base = { query: q, hits: new Map(), truncated: false } as const;
    onFilter({ ...base, hits: new Map(), status: 'searching', version: ++versionRef.current });
    const id = window.setTimeout(async () => {
      try {
        const res = await fsService.searchIndex(root, q);
        if (genRef.current !== gen) return;
        if (!res.ready) {
          onFilter({ ...base, hits: new Map(), status: 'indexing', version: ++versionRef.current });
          return;
        }
        onFilter({
          query: q,
          hits: new Map(res.files.map((f) => [f.path, f])),
          truncated: res.truncated,
          status: 'done',
          version: ++versionRef.current,
        });
      } catch (err) {
        console.warn('file-tree search failed', err);
        if (genRef.current === gen) {
          onFilter({ ...base, hits: new Map(), status: 'done', version: ++versionRef.current });
        }
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(id);
    // onFilter is a stable setter from the parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, root, indexEpoch, mode]);

  // Semantic mode: embedding search. The store re-runs a pending query by
  // itself once the index reports ready, so `semanticReady` only gates the
  // initial call.
  useEffect(() => {
    if (mode !== 'semantic') {
      semanticClear();
      return;
    }
    const q = query.trim();
    if (!q) {
      semanticClear();
      return;
    }
    const id = window.setTimeout(() => {
      void semanticSearch(root, q);
    }, semanticReady ? SEMANTIC_DEBOUNCE_MS : 0);
    return () => window.clearTimeout(id);
  }, [query, root, mode, semanticReady, semanticSearch, semanticClear]);

  const clear = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  const semantic = mode === 'semantic';

  return (
    <div className="treesearch" style={{ height: TREE_SEARCH_HEIGHT }}>
      <div className="treesearch-field">
        <SearchIcon />
        <input
          ref={inputRef}
          className="treesearch-input"
          type="search"
          placeholder={semantic ? 'Search by meaning…' : 'Filter files…'}
          aria-label={semantic ? 'Search notes by meaning' : 'Filter files by name or content'}
          value={query}
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (query) setQuery('');
              else inputRef.current?.blur();
            }
          }}
        />
        {hint && (semantic || query.trim()) && (
          <span className="treesearch-hint" aria-live="polite">
            {hint}
          </span>
        )}
        {query && (
          <button
            type="button"
            className="treesearch-clear"
            aria-label="Clear filter"
            title="Clear (esc)"
            onMouseDown={(e) => e.preventDefault()}
            onClick={clear}
          >
            ×
          </button>
        )}
        <button
          type="button"
          className={semantic ? 'treesearch-mode active' : 'treesearch-mode'}
          aria-label="Semantic search"
          aria-pressed={semantic}
          title={semantic ? 'Semantic search on — click for plain filter' : 'Search by meaning (local model)'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            onModeChange(semantic ? 'filter' : 'semantic');
            inputRef.current?.focus();
          }}
        >
          ≈
        </button>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="treesearch-icon"
      width="12"
      height="12"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
