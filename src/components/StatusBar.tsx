import { useEffect, useRef, useState } from 'react';
import { useDocumentStore } from '../stores/documentStore';
import { docStats } from '../lib/docStats';

export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc);
  const text = doc?.draft ?? '';
  const stats = docStats(text);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

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
      <div ref={popRef} style={{ position: 'relative' }}>
        <button
          className="statusbar-stat"
          onClick={() => doc && setOpen((v) => !v)}
          aria-haspopup="dialog"
          aria-expanded={open}
          title="Document statistics"
        >
          {doc ? `${stats.words} words · ${stats.chars} chars` : ' '}
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
      <span>UTF-8</span>
    </div>
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
