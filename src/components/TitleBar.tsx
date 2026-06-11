import { useConfigStore } from '../stores/configStore';
import { useDocumentStore } from '../stores/documentStore';

function SidebarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" />
      <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
    </svg>
  );
}

export function TitleBar() {
  const showSidebar = useConfigStore((s) => s.config.showSidebar);
  const update = useConfigStore((s) => s.update);
  const doc = useDocumentStore((s) => s.doc);

  const name = doc?.path?.split('/').pop() ?? (doc ? 'Untitled' : '');

  return (
    <div className="titlebar">
      <button
        className="titlebar-toggle"
        onClick={() => update({ showSidebar: !showSidebar })}
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
      >
        <SidebarIcon />
      </button>
      <div className="titlebar-title">
        {doc?.isDirty && <span className="titlebar-dirty" />}
        {name}
      </div>
    </div>
  );
}
