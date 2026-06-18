import { useRef, useState } from 'react';
import { useDocumentStore } from '../stores/documentStore';

function tabTitle(path: string | null): string {
  if (!path) return 'Untitled';
  const base = path.split('/').pop() ?? path;
  return base.replace(/\.md$/i, '');
}

function CloseIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function TabBar() {
  const tabs = useDocumentStore((s) => s.tabs);
  const activeId = useDocumentStore((s) => s.activeId);
  const activateTab = useDocumentStore((s) => s.activateTab);
  const closeTab = useDocumentStore((s) => s.closeTab);
  const moveTab = useDocumentStore((s) => s.moveTab);
  const newTab = useDocumentStore((s) => s.newTab);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragOverIndex = useRef<number | null>(null);

  // Nothing open → the editor empty-state stands in for the bar; the grid row
  // it lives in collapses to zero height.
  if (tabs.length === 0) return null;

  return (
    <div className="tabbar" role="tablist">
      <div className="tabbar-strip">
        {tabs.map((tab, i) => (
          <div
            key={tab.id}
            role="tab"
            aria-selected={tab.id === activeId}
            title={tab.doc.path ?? 'Untitled'}
            className={
              'tab' +
              (tab.id === activeId ? ' active' : '') +
              (dragIndex === i ? ' dragging' : '')
            }
            draggable
            onClick={() => activateTab(tab.id)}
            onAuxClick={(e) => {
              // Middle-click closes, like a browser tab.
              if (e.button === 1) {
                e.preventDefault();
                void closeTab(tab.id);
              }
            }}
            onDragStart={() => setDragIndex(i)}
            onDragOver={(e) => {
              e.preventDefault();
              dragOverIndex.current = i;
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null && dragIndex !== i) moveTab(dragIndex, i);
              setDragIndex(null);
              dragOverIndex.current = null;
            }}
            onDragEnd={() => {
              setDragIndex(null);
              dragOverIndex.current = null;
            }}
          >
            {tab.doc.isDirty && <span className="tab-dirty" />}
            <span className="tab-name">{tabTitle(tab.doc.path)}</span>
            <button
              className="tab-close"
              aria-label="Close tab"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation();
                void closeTab(tab.id);
              }}
            >
              <CloseIcon />
            </button>
          </div>
        ))}
      </div>
      <button className="tab-new" aria-label="New tab" title="New tab (⌘T)" onClick={() => newTab()}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
