import { useDocumentStore } from '../stores/documentStore';
import { wordCount } from '../lib/wordCount';

export function StatusBar() {
  const doc = useDocumentStore((s) => s.doc);
  const text = doc?.draft ?? '';
  const { words, chars } = wordCount(text);
  return (
    <div className="statusbar">
      <span>{doc ? `${words} words · ${chars} chars` : ' '}</span>
      <span>UTF-8</span>
    </div>
  );
}
