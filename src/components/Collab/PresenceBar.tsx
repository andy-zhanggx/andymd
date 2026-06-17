import { useCollabStore } from '../../collab/collabStore';
import { useUIStore } from '../../stores/uiStore';
import './collab.css';

function initials(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const MAX_AVATARS = 5;

/**
 * Compact presence indicator for the title bar: colored avatars for everyone in
 * the room. Clicking opens the share dialog. Renders nothing outside a session.
 */
export function PresenceBar() {
  const roomCode = useCollabStore((s) => s.roomCode);
  const state = useCollabStore((s) => s.state);
  const peers = useCollabStore((s) => s.peers);
  const setOpen = useUIStore((s) => s.setCollabDialogOpen);

  if (roomCode === null) return null;

  // Local user first, then the rest, deterministically by clientId.
  const ordered = [...peers].sort((a, b) =>
    a.self === b.self ? a.clientId - b.clientId : a.self ? -1 : 1
  );
  const shown = ordered.slice(0, MAX_AVATARS);
  const overflow = ordered.length - shown.length;

  return (
    <button
      className={`presence-bar presence-${state}`}
      onClick={() => setOpen(true)}
      title="Collaboration"
      aria-label="Collaboration session"
    >
      <span className="presence-avatars">
        {shown.map((p) => (
          <span
            key={p.clientId}
            className="presence-avatar"
            style={{ backgroundColor: p.color }}
            title={p.self ? `${p.name} (you)` : p.name}
          >
            {initials(p.name)}
          </span>
        ))}
        {overflow > 0 && <span className="presence-avatar presence-more">+{overflow}</span>}
      </span>
    </button>
  );
}
