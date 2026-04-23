import React from 'react';
import { useConfigStore } from '../stores/configStore';
import { useDocumentStore } from '../stores/documentStore';

export function TitleBar() {
  const showSidebar = useConfigStore((s) => s.config.showSidebar);
  const update = useConfigStore((s) => s.update);
  const doc = useDocumentStore((s) => s.doc);

  const name = doc?.path?.split('/').pop() ?? (doc ? 'Untitled' : '');
  const dirty = doc?.isDirty ? '● ' : '';

  return (
    <div
      style={{
        height: '38px',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px 0 80px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
        userSelect: 'none',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      <button
        onClick={() => update({ showSidebar: !showSidebar })}
        style={{
          WebkitAppRegion: 'no-drag',
          marginRight: 12,
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--fg-primary)',
          borderRadius: 4,
          padding: '2px 8px',
          cursor: 'pointer',
        } as React.CSSProperties}
        aria-label="Toggle sidebar"
      >
        ≡
      </button>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 13, color: 'var(--fg-primary)' }}>
        {dirty}{name}
      </div>
    </div>
  );
}
