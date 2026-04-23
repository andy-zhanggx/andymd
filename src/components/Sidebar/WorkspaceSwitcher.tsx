import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useConfigStore } from '../../stores/configStore';
import { dialogService } from '../../services/dialogService';

export function WorkspaceSwitcher() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const openWs = useWorkspaceStore((s) => s.open);
  const recent = useConfigStore((s) => s.config.recentWorkspaces);

  async function pickAndOpen() {
    const path = await dialogService.pickWorkspaceDir();
    if (path) await openWs(path);
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
          <option key={r} value={r}>{r.split('/').pop()}</option>
        ))}
      </select>
      <button
        onClick={pickAndOpen}
        style={{
          fontSize: 11,
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--fg-primary)',
          borderRadius: 4,
          padding: '2px 8px',
          cursor: 'pointer',
        }}
      >
        Open…
      </button>
    </div>
  );
}
