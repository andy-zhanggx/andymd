import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { useUIStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { docStats } from '../lib/docStats';
import { frontmatterKeyCount } from '../lib/frontmatter';
import { fsService, onWorkspaceChanged } from '../services/fsService';

export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc);
  const vaultRoot = useWorkspaceStore((s) => s.workspace?.root ?? null);
  const sourceMode = useUIStore((s) => s.sourceMode);
  const toggleSourceMode = useUIStore((s) => s.toggleSourceMode);
  const startTour = useUIStore((s) => s.startTour);

  const text = doc?.draft ?? '';
  const stats = docStats(text);
  const properties = frontmatterKeyCount(text);

  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);
  const backlinks = useBacklinks(doc?.path ?? null, vaultRoot, doc?.mtime ?? null);

  // Dismiss the popover on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div className="statusbar">
      <div className="statusbar-left" />
      <div className="statusbar-right">
        {doc && backlinks !== null && (
          <span className="statusbar-metric" title="Notes linking here (wikilinks + Markdown links)">
            {backlinks} {backlinks === 1 ? 'backlink' : 'backlinks'}
          </span>
        )}
        {doc && properties > 0 && (
          <span className="statusbar-metric" title="Frontmatter properties">
            {properties} {properties === 1 ? 'property' : 'properties'}
          </span>
        )}
        {doc && (
          <button
            className="statusbar-mode"
            onClick={toggleSourceMode}
            aria-pressed={sourceMode}
            title={`${sourceMode ? 'Source' : 'Visual'} mode — click to toggle (⌘/)`}
          >
            <ModeIcon source={sourceMode} />
            <span>{sourceMode ? 'Source' : 'Visual'}</span>
          </button>
        )}
        <div ref={popRef} style={{ position: 'relative' }}>
          <button
            className="statusbar-stat"
            onClick={() => doc && setOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={open}
            title="Document statistics"
          >
            {doc ? `${stats.words} words · ${stats.chars} characters` : ' '}
          </button>
          {open && doc && (
            <div className="stats-popover" role="dialog" aria-label="Document statistics">
              <Row label="Words" value={stats.words} />
              <Row label="Characters" value={stats.chars} />
              <Row label="Characters (no spaces)" value={stats.charsNoSpaces} />
              <Row label="Lines" value={stats.lines} />
              <Row label="Reading time" value={`${stats.readingTimeMin} min`} />
            </div>
          )}
        </div>
        <button
          className="statusbar-help"
          onClick={startTour}
          aria-label="Show welcome tour"
          title="Welcome tour / 使用教程"
        >
          ?
        </button>
      </div>
    </div>
  );
}

/**
 * Vault-wide backlink count for the open document. Recomputed when the document
 * or its vault changes, and (debounced) when any file in the vault changes.
 * `null` while unknown — the status bar then hides the count rather than flash a
 * stale or zero value.
 */
function useBacklinks(
  path: string | null,
  vaultRoot: string | null,
  mtime: number | null,
): number | null {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!path || !vaultRoot) {
      setCount(null);
      return;
    }
    let cancelled = false;
    const refresh = () => {
      fsService
        .countBacklinks(vaultRoot, path)
        .then((n) => {
          if (!cancelled) setCount(n);
        })
        .catch(() => {
          if (!cancelled) setCount(null);
        });
    };
    refresh();

    // Re-scan when the vault changes, debounced so a burst of save/modify
    // events doesn't trigger a flurry of full-vault scans.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlisten = onWorkspaceChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(refresh, 1200);
    });

    return () => {
      cancelled = true;
      clearTimeout(timer);
      void unlisten.then((un) => un());
    };
  }, [path, vaultRoot, mtime]);

  return count;
}

function ModeIcon({ source }: { source: boolean }) {
  // Source: a code `< >` glyph. Visual: an open-book glyph (Obsidian-style).
  return source ? (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 6 3 12l5 6M16 6l5 6-5 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ) : (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 6.5C10.5 5.5 8 5 4 5v13c4 0 6.5.5 8 1.5 1.5-1 4-1.5 8-1.5V5c-4 0-6.5.5-8 1.5ZM12 6.5v13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="stats-row">
      <span>{label}</span>
      <span className="stats-value">{value}</span>
    </div>
  );
}
