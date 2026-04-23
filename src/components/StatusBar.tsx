import { useDocumentStore } from '../stores/documentStore';
import { wordCount } from '../lib/wordCount';

export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc);
  const text = doc?.draft ?? '';
  const { words, chars } = wordCount(text);
  return (
    <div
      style={{
        height: '24px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        fontSize: 11,
        color: 'var(--fg-muted)',
        justifyContent: 'space-between',
      }}
    >
      <span>{doc ? `${words} words · ${chars} chars` : ' '}</span>
      <span>utf-8</span>
    </div>
  );
}
