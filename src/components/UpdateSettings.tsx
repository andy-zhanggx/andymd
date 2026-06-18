import { useUIStore } from '../stores/uiStore';
import { useUpdateStore } from '../stores/updateStore';
import { runUpdateCheck } from '../lib/updater';

const STATUS_TEXT: Record<string, string> = {
  idle: 'Up to date.',
  checking: 'Checking for updates…',
  downloading: 'Downloading update…',
  ready: 'Update downloaded — restart to apply.',
  error: 'Last check failed.',
};

export function UpdateSettings() {
  const open = useUIStore((s) => s.updateSettingsOpen);
  const close = () => useUIStore.getState().setUpdateSettingsOpen(false);
  const status = useUpdateStore((s) => s.status);

  if (!open) return null;

  const version = useUpdateStore.getState().availableVersion;
  const statusLine =
    status === 'downloading' && version
      ? `Downloading ${version}…`
      : STATUS_TEXT[status] ?? '';

  return (
    <div className="update-backdrop" onClick={close}>
      <div className="update-card" role="dialog" aria-modal="true" aria-label="Software Update" onClick={(e) => e.stopPropagation()}>
        <header className="update-head">
          <h2>Software Update</h2>
          <button className="update-close" onClick={close} aria-label="Close">×</button>
        </header>
        <div className="update-body">
          <p className="update-status">{statusLine}</p>
        </div>
        <footer className="update-foot">
          <button
            className="update-primary"
            disabled={status === 'checking' || status === 'downloading'}
            onClick={() => void runUpdateCheck(true)}
          >
            Check for updates now
          </button>
        </footer>
      </div>
    </div>
  );
}
