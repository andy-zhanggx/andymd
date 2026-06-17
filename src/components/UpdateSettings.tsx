import { useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useConfigStore } from '../stores/configStore';
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
  const token = useConfigStore((s) => s.config.updateToken);
  const update = useConfigStore((s) => s.update);
  const status = useUpdateStore((s) => s.status);
  const [draft, setDraft] = useState(token);

  if (!open) return null;

  const statusLine = token ? STATUS_TEXT[status] ?? '' : 'No update token set.';

  return (
    <div className="update-backdrop" onClick={close}>
      <div className="update-card" role="dialog" aria-modal="true" aria-label="Software Update" onClick={(e) => e.stopPropagation()}>
        <header className="update-head">
          <h2>Software Update</h2>
          <button className="update-close" onClick={close} aria-label="Close">×</button>
        </header>
        <div className="update-body">
          <label className="update-label" htmlFor="update-token">GitLab access token</label>
          <input
            id="update-token"
            className="update-token"
            type="password"
            placeholder="Personal Access Token (read_api)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="update-status">{statusLine}</p>
        </div>
        <footer className="update-foot">
          <button className="update-secondary" onClick={() => void update({ updateToken: draft })}>Save token</button>
          <button
            className="update-primary"
            onClick={async () => {
              await update({ updateToken: draft });
              void runUpdateCheck(true);
            }}
          >
            Check for updates now
          </button>
        </footer>
      </div>
    </div>
  );
}
