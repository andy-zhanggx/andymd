import { useMemo } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { unifiedRows, type DiffRow } from '../lib/diff';
import { merge3 } from '../lib/merge';
import type { FileConflict } from '../types';

/** Presentational body, extracted so tests can render it without the store. */
export function ConflictDialogView({
  fileName,
  base,
  draft,
  conflict,
  onResolve,
  onDismiss,
}: {
  fileName: string;
  /** The disk snapshot the draft is based on (doc.content). */
  base: string;
  draft: string;
  conflict: FileConflict;
  onResolve: (resolution: 'keepMine' | 'useTheirs' | 'merge') => void;
  onDismiss: () => void;
}) {
  const rows = useMemo(
    () => unifiedRows(draft, conflict.diskContent, 2),
    [draft, conflict.diskContent],
  );
  const overlaps = useMemo(
    () => merge3(base, draft, conflict.diskContent).conflicts,
    [base, draft, conflict.diskContent],
  );

  const rowClass = (r: DiffRow) =>
    r.type === 'add' ? 'cd-line add' : r.type === 'del' ? 'cd-line del' : r.type === 'gap' ? 'cd-line gap' : 'cd-line';
  const rowSign = (r: DiffRow) => (r.type === 'add' ? '+' : r.type === 'del' ? '−' : ' ');

  return (
    <div className="vh-overlay" onMouseDown={onDismiss}>
      <div
        className="vh-modal cd-modal"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="File changed on disk"
      >
        <div className="vh-header">
          <span>File changed on disk — {fileName}</span>
          <button className="vh-close" onClick={onDismiss} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="cd-explain">
          Someone else modified this file while you have unsaved edits. Review the
          differences and choose how to reconcile them.
          <span className="cd-legend">
            <span className="cd-legend-del">− your unsaved version</span>
            <span className="cd-legend-add">+ version on disk</span>
          </span>
        </div>
        <div className="cd-diff" role="log" aria-label="Differences">
          <pre>
            {rows.map((r, i) => (
              <div key={i} className={rowClass(r)}>
                <span className="cd-sign">{rowSign(r)}</span>
                {r.text}
              </div>
            ))}
          </pre>
        </div>
        <div className="vh-footer cd-footer">
          <button className="vh-btn" onClick={onDismiss} title="Keep editing; you'll be asked again on save">
            Decide later
          </button>
          <span className="cd-spacer" />
          <button className="vh-btn" onClick={() => onResolve('useTheirs')} title="Discard your edits and load the disk version">
            Use disk version
          </button>
          <button className="vh-btn" onClick={() => onResolve('keepMine')} title="Overwrite the file with your version">
            Keep mine
          </button>
          <button
            className="vh-btn primary"
            onClick={() => onResolve('merge')}
            title="Combine both versions; overlapping edits get conflict markers to resolve in the editor"
          >
            {overlaps > 0 ? `Merge both (${overlaps} overlap${overlaps > 1 ? 's' : ''})` : 'Merge both'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Modal shown when the ACTIVE tab's file changed on disk while it has unsaved
 * edits. Offers diff review plus keep-mine / use-theirs / three-way merge.
 */
export function ConflictDialog() {
  const doc = useDocumentStore((s) => s.doc);
  const conflict = useDocumentStore((s) => (s.doc?.path ? s.conflicts[s.doc.path] : undefined));
  if (!doc?.path || !conflict) return null;

  const path = doc.path;
  const fileName = path.split('/').pop() ?? path;
  return (
    <ConflictDialogView
      fileName={fileName}
      base={doc.content}
      draft={doc.draft}
      conflict={conflict}
      onResolve={(resolution) => void useDocumentStore.getState().resolveConflict(path, resolution)}
      onDismiss={() => useDocumentStore.getState().dismissConflict(path)}
    />
  );
}
