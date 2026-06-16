import { useEffect, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useDocumentStore } from '../stores/documentStore';
import { versionService, type Version } from '../services/versionService';

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Modal listing saved snapshots of the current file, with preview + restore. */
export function VersionHistory() {
  const open = useUIStore((s) => s.versionHistoryOpen);
  const close = () => useUIStore.getState().setVersionHistoryOpen(false);
  const doc = useDocumentStore((s) => s.doc);
  const setDraft = useDocumentStore((s) => s.setDraft);

  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<Version | null>(null);
  const [preview, setPreview] = useState('');

  useEffect(() => {
    if (!open || !doc?.path) return;
    void versionService.list(doc.path).then((list) => {
      setVersions(list);
      setSelected(list[0] ?? null);
    });
  }, [open, doc?.path]);

  useEffect(() => {
    if (!open || !doc?.path || !selected) {
      setPreview('');
      return;
    }
    void versionService.read(doc.path, selected.file).then(setPreview).catch(() => setPreview(''));
  }, [open, doc?.path, selected]);

  if (!open) return null;

  const restore = () => {
    if (preview) setDraft(preview);
    close();
  };

  return (
    <div className="vh-overlay" onMouseDown={close}>
      <div className="vh-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Version history">
        <div className="vh-header">
          <span>Version History</span>
          <button className="vh-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>
        {versions.length === 0 ? (
          <div className="vh-empty">No saved versions yet. Versions are captured each time you save.</div>
        ) : (
          <div className="vh-body">
            <ul className="vh-list">
              {versions.map((v) => (
                <li key={v.file}>
                  <button
                    className={`vh-item${selected?.file === v.file ? ' active' : ''}`}
                    onClick={() => setSelected(v)}
                  >
                    {formatTs(v.ts)}
                  </button>
                </li>
              ))}
            </ul>
            <div className="vh-preview">
              <pre>{preview}</pre>
            </div>
          </div>
        )}
        <div className="vh-footer">
          <button className="vh-btn" onClick={close}>
            Cancel
          </button>
          <button className="vh-btn primary" onClick={restore} disabled={!selected}>
            Restore this version
          </button>
        </div>
      </div>
    </div>
  );
}
