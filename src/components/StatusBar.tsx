import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { useUIStore } from '../stores/uiStore';
import { useConfigStore } from '../stores/configStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { docStats } from '../lib/docStats';
import { frontmatterKeyCount } from '../lib/frontmatter';
import { fsService, onWorkspaceChanged, type BacklinkSource } from '../services/fsService';
import { ZoomControl } from './ZoomControl';

export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc);
  const vaultRoot = useWorkspaceStore((s) => s.workspace?.root ?? null);
  const sourceMode = useUIStore((s) => s.sourceMode);
  const toggleSourceMode = useUIStore((s) => s.toggleSourceMode);
  const startTour = useUIStore((s) => s.startTour);
  const showMinimap = useConfigStore((s) => s.config.showMinimap);
  const updateConfig = useConfigStore((s) => s.update);

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
      <div className="statusbar-left">{doc && <ZoomControl />}</div>
      <div className="statusbar-right">
        {doc && backlinks !== null && (
          <BacklinksMetric
            count={backlinks}
            path={doc.path}
            vaultRoot={vaultRoot}
          />
        )}
        {doc && properties > 0 && (
          <span className="statusbar-metric" title="Frontmatter properties">
            {properties} {properties === 1 ? 'property' : 'properties'}
          </span>
        )}
        {doc && !sourceMode && (
          <button
            className="statusbar-mode"
            onClick={() => void updateConfig({ showMinimap: !showMinimap })}
            aria-pressed={showMinimap}
            title="Minimap — click to toggle (⇧⌘M)"
          >
            <MinimapIcon />
            <span>Minimap</span>
          </button>
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
 * The backlinks count as a button: clicking it opens a popover listing which
 * notes link here, with the matching lines; clicking a note opens it.
 */
function BacklinksMetric({
  count,
  path,
  vaultRoot,
}: {
  count: number;
  path: string | null;
  vaultRoot: string | null;
}) {
  const openDoc = useDocumentStore((s) => s.open);
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<BacklinkSource[] | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // (Re)load the sources each time the popover opens — the count already
  // tracks vault changes, so an open-time fetch is always fresh enough.
  useEffect(() => {
    if (!open || !path || !vaultRoot) return;
    let cancelled = false;
    setSources(null);
    fsService
      .listBacklinks(vaultRoot, path)
      .then((s) => {
        if (!cancelled) setSources(s);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, path, vaultRoot]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="statusbar-stat"
        onClick={() => count > 0 && setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Notes linking here (wikilinks + Markdown links) — click to browse"
      >
        {count} {count === 1 ? 'backlink' : 'backlinks'}
      </button>
      {open && (
        <div className="stats-popover backlinks-popover" role="dialog" aria-label="Backlinks">
          {sources === null && <div className="backlinks-empty">Loading…</div>}
          {sources !== null && sources.length === 0 && (
            <div className="backlinks-empty">No backlinks</div>
          )}
          {sources?.map((src) => (
            <div key={src.path} className="backlinks-source">
              <button
                className="backlinks-file"
                title={src.relPath}
                onClick={() => {
                  setOpen(false);
                  void openDoc(src.path);
                }}
              >
                <span className="backlinks-filename">{src.relPath}</span>
                <span className="backlinks-count">{src.linkCount}</span>
              </button>
              {src.lines.map((l) => (
                <div key={l.line} className="backlinks-line" title={l.text}>
                  <span className="backlinks-lineno">{l.line}</span>
                  <span className="backlinks-text">{l.text}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
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

function MinimapIcon() {
  // A pane with a narrow strip on its right edge.
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M16 4v16" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
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
