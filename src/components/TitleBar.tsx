import { useConfigStore } from '../stores/configStore';
import { useDocumentStore } from '../stores/documentStore';
import { UpdateButton } from './UpdateButton';
import { useUIStore } from '../stores/uiStore';
import { useCollabStore } from '../collab/collabStore';
import { PresenceBar } from './Collab/PresenceBar';
import { ONLINE_COLLAB } from '../featureFlags';
import { BUILD_LABEL } from '../buildInfo';

function SidebarIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="2.5" width="13" height="11" rx="2" stroke="currentColor" />
      <line x1="6" y1="2.5" x2="6" y2="13.5" stroke="currentColor" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4" cy="8" r="2" stroke="currentColor" />
      <circle cx="12" cy="4" r="2" stroke="currentColor" />
      <circle cx="12" cy="12" r="2" stroke="currentColor" />
      <line x1="5.7" y1="7" x2="10.3" y2="4.8" stroke="currentColor" />
      <line x1="5.7" y1="9" x2="10.3" y2="11.2" stroke="currentColor" />
    </svg>
  );
}

export function TitleBar() {
  const showSidebar = useConfigStore((s) => s.config.showSidebar);
  const update = useConfigStore((s) => s.update);
  const doc = useDocumentStore((s) => s.doc);
  const back = useDocumentStore((s) => s.back);
  const forward = useDocumentStore((s) => s.forward);
  const canGoBack = useDocumentStore((s) => s.historyIndex > 0);
  const canGoForward = useDocumentStore((s) => s.historyIndex < s.history.length - 1);
  const setCollabDialogOpen = useUIStore((s) => s.setCollabDialogOpen);
  const collabActive = useCollabStore((s) => s.roomCode !== null);

  const name = doc?.path?.split('/').pop() ?? (doc ? 'Untitled' : '');

  // Window dragging goes through Tauri's `data-tauri-drag-region` attribute,
  // NOT the Electron-only `-webkit-app-region: drag` CSS (a no-op in WKWebView).
  // The attribute lives on the bar and the centered title; interactive children
  // like the toggle button deliberately omit it so they stay clickable.
  return (
    <div className="titlebar" data-tauri-drag-region>
      <button
        className="titlebar-toggle"
        onClick={() => update({ showSidebar: !showSidebar })}
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
      >
        <SidebarIcon />
      </button>
      <button
        className="titlebar-toggle"
        onClick={() => void back()}
        disabled={!canGoBack}
        aria-label="Go back"
        title="Back (⌘[)"
      >
        <BackIcon />
      </button>
      <button
        className="titlebar-toggle"
        onClick={() => void forward()}
        disabled={!canGoForward}
        aria-label="Go forward"
        title="Forward (⌘])"
      >
        <ForwardIcon />
      </button>
      <div className="titlebar-title" data-tauri-drag-region>
        {doc?.isDirty && <span className="titlebar-dirty" />}
        {name}
      </div>
      <div className="titlebar-right">
        {BUILD_LABEL && (
          <span className="titlebar-build" title={`Build: ${BUILD_LABEL}`}>
            {BUILD_LABEL}
          </span>
        )}
        <UpdateButton />
        {ONLINE_COLLAB && <PresenceBar />}
        {ONLINE_COLLAB && doc && (
          <button
            className={`titlebar-toggle${collabActive ? ' active' : ''}`}
            onClick={() => setCollabDialogOpen(true)}
            aria-label="Collaborate"
            title="协作 / Share"
          >
            <ShareIcon />
          </button>
        )}
      </div>
    </div>
  );
}
