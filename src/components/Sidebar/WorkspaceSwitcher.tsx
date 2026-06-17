import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useConfigStore } from '../../stores/configStore';
import { dialogService } from '../../services/dialogService';
import { useDocumentStore } from '../../stores/documentStore';

function ChevronDown() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.5 6 8 10.5 12.5 6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function NewFileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 1.5h5.5L13 5v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
        stroke="currentColor"
      />
      <path d="M9.5 1.5V5H13" stroke="currentColor" />
      <path d="M8 7.5v4M6 9.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 1.5h5.5L13 5v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
        stroke="currentColor"
      />
      <path d="M9.5 1.5V5H13" stroke="currentColor" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 2h5.9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-8Z"
        stroke="currentColor"
      />
    </svg>
  );
}

export function WorkspaceSwitcher() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openWs = useWorkspaceStore((s) => s.open);
  const recent = useConfigStore((s) => s.config.recentWorkspaces);

  async function switchWorkspace(path: string) {
    try {
      await openWs(path);
    } catch (err) {
      if (String((err as Error).message).startsWith('WORKSPACE_UNAVAILABLE')) {
        window.alert(
          `That folder is no longer available:\n${path}\n\nIt has been removed from recent workspaces.`,
        );
      } else {
        console.error(err);
      }
    }
  }

  async function pickAndOpen() {
    const path = await dialogService.pickWorkspaceDir();
    if (path) await switchWorkspace(path);
  }

  async function pickAndOpenFile() {
    const path = await dialogService.pickMarkdownFile();
    if (path) await useDocumentStore.getState().open(path);
  }

  return (
    <div className="ws-header">
      <div className="ws-select-wrap">
        <select
          className="ws-select"
          value={workspace?.root ?? ''}
          onChange={(e) => { if (e.target.value) void switchWorkspace(e.target.value); }}
          aria-label="Switch workspace"
        >
          <option value="" disabled>
            {workspace ? workspace.name : 'No Workspace'}
          </option>
          {recent.map((r) => (
            <option key={r} value={r}>
              {r.split('/').pop()}
            </option>
          ))}
        </select>
        <span className="ws-select-chevron">
          <ChevronDown />
        </span>
      </div>
      <button
        className="ws-action"
        onClick={() => void useDocumentStore.getState().newFile()}
        aria-label="New file"
        title="New File"
      >
        <NewFileIcon />
      </button>
      <button className="ws-action" onClick={pickAndOpenFile} aria-label="Open file" title="Open File…">
        <DocumentIcon />
      </button>
      <button className="ws-action" onClick={pickAndOpen} aria-label="Open folder" title="Open Folder…">
        <FolderIcon />
      </button>
    </div>
  );
}
