import { useEffect, useRef } from 'react';
import { useUIStore } from '../stores/uiStore';

/** "Update N links in M notes?" after a rename/move. */
export function RelinkDialog() {
  const prompt = useUIStore((s) => s.relinkPrompt);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (prompt) requestAnimationFrame(() => primary.current?.focus());
  }, [prompt]);

  if (!prompt) return null;
  const total = prompt.files.reduce((n, f) => n + f.changes, 0);
  const notes = prompt.files.length;

  return (
    <div className="quickopen-backdrop" onMouseDown={() => prompt.resolve('cancel')}>
      <div
        className="quickopen relink-dialog"
        role="alertdialog"
        aria-labelledby="relink-title"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            prompt.resolve('cancel');
          }
        }}
      >
        <div className="relink-body">
          <h2 id="relink-title" className="relink-title">
            Update links to “{prompt.toName}”?
          </h2>
          <p className="relink-text">
            Renaming “{prompt.fromName}” would break {total} {total === 1 ? 'link' : 'links'} in {notes}{' '}
            {notes === 1 ? 'note' : 'notes'}. AndyMD can rewrite them to point at the new location.
          </p>
          <ul className="relink-files">
            {prompt.files.map((f) => (
              <li key={f.relPath}>
                <span className="relink-file">{f.relPath}</span>
                <span className="relink-count">{f.changes}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="quickopen-footer relink-actions">
          <button className="relink-btn" onClick={() => prompt.resolve('cancel')}>
            Cancel
          </button>
          <span style={{ flex: 1 }} />
          <button className="relink-btn" onClick={() => prompt.resolve('skip')}>
            Rename Only
          </button>
          <button ref={primary} className="relink-btn primary" onClick={() => prompt.resolve('update')}>
            Update Links
          </button>
        </div>
      </div>
    </div>
  );
}
