import { useUpdateStore } from '../stores/updateStore';
import { installAndRelaunch } from '../lib/updater';
import type { UpdateStatus } from '../stores/updateStore';

export function UpdateButtonView({
  status,
  version,
  onRestart,
}: {
  status: UpdateStatus;
  version: string | null;
  onRestart: () => void;
}) {
  if (status === 'ready') {
    return (
      <button
        className="update-btn"
        onClick={onRestart}
        title={version ? `Update ${version} downloaded — restart to apply` : 'Restart to update'}
      >
        Restart to update
      </button>
    );
  }
  if (status === 'downloading') {
    return <span className="update-downloading">Updating…</span>;
  }
  return null;
}

export function UpdateButton() {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.availableVersion);
  return <UpdateButtonView status={status} version={version} onRestart={() => void installAndRelaunch()} />;
}
