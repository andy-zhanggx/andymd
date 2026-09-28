import { useEffect, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentStore } from '../stores/documentStore';
import { useConfigStore } from '../stores/configStore';
import { useSemanticStore } from '../stores/semanticStore';
import { fsService } from '../services/fsService';
import { MULTI_TABS } from '../featureFlags';
import type { DuplicatePair } from '../lib/semantic';

const LEVELS = [
  { label: 'Near-identical', value: 0.96 },
  { label: 'Very similar', value: 0.92 },
  { label: 'Similar', value: 0.88 },
];

/** Vault report of note pairs whose overall meaning is nearly the same. */
export function DuplicatesDialog() {
  const open = useUIStore((s) => s.duplicatesOpen);
  const setOpen = useUIStore((s) => s.setDuplicatesOpen);
  const root = useWorkspaceStore((s) => s.workspace?.root ?? null);
  const enabled = useConfigStore((s) => s.config.semanticSearch);
  const status = useSemanticStore((s) => s.status);
  const [threshold, setThreshold] = useState(0.92);
  const [pairs, setPairs] = useState<DuplicatePair[] | null>(null);
  const ready = enabled && status.phase === 'ready' && status.root === root;

  useEffect(() => {
    if (!open || !root || !ready) return;
    let cancelled = false;
    setPairs(null);
    fsService
      .semanticDuplicates(root, threshold)
      .then((res) => !cancelled && setPairs(res.pairs))
      .catch(() => !cancelled && setPairs([]));
    return () => {
      cancelled = true;
    };
  }, [open, root, ready, threshold]);

  if (!open) return null;
  const close = () => setOpen(false);

  const openBoth = async (p: DuplicatePair) => {
    close();
    const docs = useDocumentStore.getState();
    await docs.open(p.a);
    if (MULTI_TABS) await docs.openInNewTab(p.b);
  };

  let body: React.ReactNode;
  if (!root) body = <p className="relink-text">Open a folder first.</p>;
  else if (!enabled)
    body = (
      <p className="relink-text">
        Finding duplicates uses semantic search. Turn it on with the ≈ toggle in the file-tree search box
        (or the Related tab) first.
      </p>
    );
  else if (!ready) body = <p className="relink-text">The semantic index is still being built…</p>;
  else if (pairs === null) body = <p className="relink-text">Comparing notes…</p>;
  else if (pairs.length === 0) body = <p className="relink-text">No duplicate notes at this level.</p>;
  else
    body = (
      <ul className="relink-files duplicates-list">
        {pairs.map((p) => (
          <li key={`${p.a}|${p.b}`}>
            <span className="relink-file" title={`${p.aRel}\n${p.bRel}`}>
              {p.aRel} <span className="duplicates-sep">≈</span> {p.bRel}
            </span>
            <span className="relink-count">{Math.round(p.score * 100)}%</span>
            <button type="button" className="relink-btn" onClick={() => void openBoth(p)}>
              {MULTI_TABS ? 'Open both' : 'Open'}
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="quickopen-backdrop" onMouseDown={close}>
      <div
        className="quickopen relink-dialog"
        role="dialog"
        aria-labelledby="dup-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.key === 'Escape' && close()}
        tabIndex={-1}
      >
        <div className="relink-body">
          <h2 id="dup-title" className="relink-title">
            Duplicate notes
          </h2>
          <div className="related-mode" role="radiogroup" aria-label="How similar">
            {LEVELS.map((l) => (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={threshold === l.value}
                className={`related-mode-btn${threshold === l.value ? ' active' : ''}`}
                onClick={() => setThreshold(l.value)}
              >
                {l.label}
              </button>
            ))}
          </div>
          {body}
        </div>
        <div className="quickopen-footer relink-actions">
          <span className="quickopen-hint">Compared on this Mac using the semantic index</span>
          <span style={{ flex: 1 }} />
          <button className="relink-btn" onClick={close}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
