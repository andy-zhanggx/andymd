import { useEffect, useState } from 'react';
import { useUIStore } from '../../stores/uiStore';
import { useConfigStore } from '../../stores/configStore';
import { useDocumentStore } from '../../stores/documentStore';
import { useCollabStore } from '../../collab/collabStore';
import { formatRoomCode, isValidRoomCode } from '../../collab/roomCode';
import './collab.css';

type Tab = 'share' | 'join';

const STATUS_LABEL: Record<string, string> = {
  idle: '',
  connecting: 'Connecting…',
  connected: 'Connected',
  reconnecting: 'Reconnecting…',
  error: 'Connection error',
};

export function ShareDialog() {
  const open = useUIStore((s) => s.collabDialogOpen);
  const setOpen = useUIStore((s) => s.setCollabDialogOpen);

  const serverUrl = useConfigStore((s) => s.config.collabServerUrl);
  const displayName = useConfigStore((s) => s.config.displayName);
  const updateConfig = useConfigStore((s) => s.update);

  const state = useCollabStore((s) => s.state);
  const role = useCollabStore((s) => s.role);
  const roomCode = useCollabStore((s) => s.roomCode);
  const peers = useCollabStore((s) => s.peers);
  const error = useCollabStore((s) => s.error);
  const host = useCollabStore((s) => s.host);
  const join = useCollabStore((s) => s.join);
  const leave = useCollabStore((s) => s.leave);

  const [tab, setTab] = useState<Tab>('share');
  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setCopied(false);
      setCodeInput('');
    }
  }, [open]);

  if (!open) return null;

  const close = () => setOpen(false);
  const active = roomCode !== null;

  const startHosting = () => {
    if (!serverUrl.trim()) return;
    host(serverUrl.trim(), displayName);
  };

  const startJoining = () => {
    if (!serverUrl.trim() || !isValidRoomCode(codeInput)) return;
    // A guest needs a document to render the editor into; the shared content
    // streams into this empty draft once connected.
    if (!useDocumentStore.getState().doc) useDocumentStore.getState().newDraft();
    join(serverUrl.trim(), codeInput, displayName);
  };

  const copyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is visible to copy manually */
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  };

  return (
    <div className="collab-backdrop" onMouseDown={close}>
      <div
        className="collab-dialog"
        role="dialog"
        aria-label="Collaborate"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="collab-header">
          <span className="collab-title">协作 · Collaborate</span>
          <button className="collab-close" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>

        {active ? (
          <ActivePanel
            role={role}
            roomCode={roomCode}
            state={state}
            peers={peers}
            error={error}
            copied={copied}
            onCopy={copyCode}
            onLeave={() => {
              leave();
            }}
          />
        ) : (
          <>
            <div className="collab-tabs">
              <button
                className={tab === 'share' ? 'collab-tab active' : 'collab-tab'}
                onClick={() => setTab('share')}
              >
                Share
              </button>
              <button
                className={tab === 'join' ? 'collab-tab active' : 'collab-tab'}
                onClick={() => setTab('join')}
              >
                Join
              </button>
            </div>

            <label className="collab-field">
              <span>Your name</span>
              <input
                value={displayName}
                placeholder="(auto)"
                onChange={(e) => void updateConfig({ displayName: e.target.value })}
              />
            </label>

            <label className="collab-field">
              <span>Server</span>
              <input
                value={serverUrl}
                placeholder="ws://your-server:1234"
                onChange={(e) => void updateConfig({ collabServerUrl: e.target.value })}
              />
            </label>

            {tab === 'share' ? (
              <div className="collab-section">
                <p className="collab-hint">
                  Share this document and get a code. Anyone with the code can edit
                  it with you in real time.
                </p>
                <button
                  className="collab-primary"
                  onClick={startHosting}
                  disabled={!serverUrl.trim()}
                >
                  Start sharing
                </button>
              </div>
            ) : (
              <div className="collab-section">
                <label className="collab-field">
                  <span>Code</span>
                  <input
                    value={codeInput}
                    placeholder="ABCD-1234"
                    autoFocus
                    onChange={(e) => setCodeInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') startJoining();
                    }}
                  />
                </label>
                <button
                  className="collab-primary"
                  onClick={startJoining}
                  disabled={!serverUrl.trim() || !isValidRoomCode(codeInput)}
                >
                  Join
                </button>
              </div>
            )}
            {error && <div className="collab-error">{error}</div>}
          </>
        )}
      </div>
    </div>
  );
}

function ActivePanel(props: {
  role: 'host' | 'guest' | null;
  roomCode: string;
  state: string;
  peers: { clientId: number; name: string; color: string; self: boolean }[];
  error: string | null;
  copied: boolean;
  onCopy: () => void;
  onLeave: () => void;
}) {
  const { role, roomCode, state, peers, error, copied, onCopy, onLeave } = props;
  return (
    <div className="collab-section">
      <div className="collab-codebox">
        <span className="collab-code">{formatRoomCode(roomCode)}</span>
        <button className="collab-copy" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className={`collab-status collab-status-${state}`}>
        <span className="collab-dot" />
        {STATUS_LABEL[state] ?? state}
        {role && <span className="collab-role"> · you are the {role}</span>}
      </div>

      <div className="collab-peers-title">In this document ({peers.length})</div>
      <div className="collab-peers-list">
        {peers.map((p) => (
          <div key={p.clientId} className="collab-peer">
            <span className="collab-peer-dot" style={{ backgroundColor: p.color }} />
            <span className="collab-peer-name">
              {p.name}
              {p.self && ' (you)'}
            </span>
          </div>
        ))}
        {peers.length === 0 && <div className="collab-hint">Waiting for sync…</div>}
      </div>

      {error && <div className="collab-error">{error}</div>}
      <button className="collab-leave" onClick={onLeave}>
        Leave session
      </button>
    </div>
  );
}
