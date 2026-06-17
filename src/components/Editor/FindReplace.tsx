import { useEffect, useRef, useState } from 'react';
import type { EditorView } from '@milkdown/prose/view';
import { useUIStore } from '../../stores/uiStore';
import {
  setSearch,
  navigate,
  replaceCurrent,
  replaceAll,
  clearSearch,
  getSearchState,
} from './searchPlugin';

interface Props {
  getView: () => EditorView | null;
}

/**
 * Floating Find / Replace bar pinned to the top-right of the editor pane.
 * Driven by `uiStore.findOpen`; talks to the ProseMirror search plugin.
 */
export function FindReplace({ getView }: Props) {
  const open = useUIStore((s) => s.findOpen);
  const replaceMode = useUIStore((s) => s.replaceMode);
  const close = useUIStore((s) => s.closeFind);

  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [count, setCount] = useState(0);
  const [current, setCurrent] = useState(-1);
  const findInputRef = useRef<HTMLInputElement>(null);

  const refresh = () => {
    const view = getView();
    if (!view) return;
    const s = getSearchState(view.state);
    setCount(s.matches.length);
    setCurrent(s.current);
  };

  // Run a fresh search whenever the query, case mode, or visibility changes.
  useEffect(() => {
    const view = getView();
    if (!view) return;
    if (!open) {
      clearSearch(view);
      return;
    }
    const s = setSearch(view, query, caseSensitive);
    setCount(s.matches.length);
    setCurrent(s.current);
  }, [query, caseSensitive, open, getView]);

  // Focus + select the find input each time the bar opens.
  useEffect(() => {
    if (open) {
      findInputRef.current?.focus();
      findInputRef.current?.select();
    }
  }, [open, replaceMode]);

  if (!open) return null;

  const go = (dir: 1 | -1) => {
    const view = getView();
    if (!view) return;
    const s = navigate(view, dir);
    setCurrent(s.current);
    findInputRef.current?.focus();
  };

  const doReplace = () => {
    const view = getView();
    if (!view) return;
    replaceCurrent(view, replacement);
    // Re-run search so the next match becomes current.
    const s = setSearch(view, query, caseSensitive);
    setCount(s.matches.length);
    setCurrent(s.current);
  };

  const doReplaceAll = () => {
    const view = getView();
    if (!view) return;
    replaceAll(view, replacement);
    refresh();
    setCount(0);
    setCurrent(-1);
  };

  const onFindKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      go(e.shiftKey ? -1 : 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="find-bar" role="search">
      <div className="find-row">
        <input
          ref={findInputRef}
          className="find-input"
          placeholder="Find"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onFindKey}
          aria-label="Find"
        />
        <span className="find-count">{count > 0 ? `${current + 1}/${count}` : '0/0'}</span>
        <button
          className={caseSensitive ? 'find-btn active' : 'find-btn'}
          title="Match case"
          aria-pressed={caseSensitive}
          onClick={() => setCaseSensitive((v) => !v)}
        >
          Aa
        </button>
        <button className="find-btn" title="Previous (⇧⏎)" onClick={() => go(-1)} disabled={count === 0}>
          ↑
        </button>
        <button className="find-btn" title="Next (⏎)" onClick={() => go(1)} disabled={count === 0}>
          ↓
        </button>
        <button className="find-btn" title="Close (Esc)" onClick={close}>
          ✕
        </button>
      </div>
      {replaceMode && (
        <div className="find-row">
          <input
            className="find-input"
            placeholder="Replace"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                doReplace();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                close();
              }
            }}
            aria-label="Replace"
          />
          <button className="find-btn wide" onClick={doReplace} disabled={count === 0}>
            Replace
          </button>
          <button className="find-btn wide" onClick={doReplaceAll} disabled={count === 0}>
            All
          </button>
        </div>
      )}
    </div>
  );
}
