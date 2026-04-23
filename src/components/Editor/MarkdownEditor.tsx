import { useEffect, useRef } from 'react';
import { buildEditor } from './milkdownConfig';
import { useDocumentStore } from '../../stores/documentStore';
import './editor-styles.css';

export function MarkdownEditor() {
  const doc = useDocumentStore((s) => s.doc);
  const setDraft = useDocumentStore((s) => s.setDraft);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !doc) return;

    const root = ref.current;
    root.innerHTML = '';

    let disposed = false;
    const editor = buildEditor({
      root,
      initialValue: doc.content,
      onChange: (markdown) => {
        if (!disposed) {
          setDraft(markdown);
        }
      },
    });

    void editor.create().then(() => {
      if (disposed) {
        void editor.destroy();
      }
    });

    return () => {
      disposed = true;
      void editor.destroy().finally(() => {
        root.innerHTML = '';
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.path]);

  if (!doc) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          height: '100%',
          color: 'var(--fg-muted)',
        }}
      >
        Open a file from the sidebar or press ⌘O
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="editor-container"
      style={{ maxWidth: 740, margin: '0 auto', padding: '32px 24px' }}
    />
  );
}
