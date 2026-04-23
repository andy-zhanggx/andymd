import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useConfigStore } from '../../stores/configStore';
import { dialogService } from '../../services/dialogService';
import { useDocumentStore } from '../../stores/documentStore';

export function WorkspaceSwitcher() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openWs = useWorkspaceStore((s) => s.open);
  const recent = useConfigStore((s) => s.config.recentWorkspaces);
  const buttonStyle = {
    fontSize: 11,
    background: 'transparent',
    border: '1px solid var(--border)',
    color: 'var(--fg-primary)',
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer',
  } as const;

  async function pickAndOpen() {
    const path = await dialogService.pickWorkspaceDir();
    if (path) await openWs(path);
  }

  async function pickAndOpenFile() {
    const path = await dialogService.pickMarkdownFile();
    if (path) await useDocumentStore.getState().open(path);
  }

  return (
    <div
      style={{
        height: 40,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        gap: 6,
      }}
    >
      <select
        value={workspace?.root ?? ''}
        onChange={(e) => { if (e.target.value) openWs(e.target.value); }}
        style={{
          flex: 1,
          background: 'transparent',
          color: 'var(--fg-primary)',
          border: 'none',
          outline: 'none',
        }}
      >
        <option value="" disabled>
          {workspace ? workspace.name : 'No workspace'}
        </option>
        {recent.map((r) => (
          <option key={r} value={r}>
            {r.split('/').pop()}
          </option>
        ))}
      </select>
      <button
        onClick={pickAndOpenFile}
        style={{ ...buttonStyle, marginRight: 2 }}
      >
        Open File
      </button>
      <button
        onClick={pickAndOpen}
        style={buttonStyle}
      >
        Open…
      </button>
    </div>
  );
}
