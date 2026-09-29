import { useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { COMMANDS, filterCommands, loadRecentCommands, rememberCommand, type Command } from '../lib/commands';
import { handleMenuAction } from '../hooks/useShortcuts';

/**
 * ⇧⌘P — fuzzy list of every command, with its shortcut. Recently used
 * commands lead when the query is empty.
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen);
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => filterCommands(COMMANDS, query, recent), [query, recent]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setRecent(loadRecentCommands());
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const close = () => setOpen(false);
  const run = (c: Command) => {
    close();
    rememberCommand(c.id);
    // Let the palette unmount and focus return to the editor first, so
    // commands that act on the editor selection see the real one.
    requestAnimationFrame(() => void handleMenuAction(c.id));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const c = items[active];
      if (c) run(c);
    }
  };

  const recentSet = new Set(recent);
  return (
    <div className="quickopen-backdrop" onMouseDown={close}>
      <div
        className="quickopen command-palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="quickopen-input"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Command"
        />
        <div className="quickopen-list" ref={listRef} role="listbox">
          {items.length === 0 && <div className="quickopen-empty">No matching commands</div>}
          {items.map((c, i) => (
            <div
              key={c.id}
              data-index={i}
              className={i === active ? 'quickopen-item active' : 'quickopen-item'}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(c)}
            >
              <span className="command-category">{c.category}</span>
              <span className="quickopen-name">{c.title}</span>
              {!query && recentSet.has(c.id) && <span className="command-recent">recent</span>}
              {c.shortcut && <kbd className="command-shortcut">{c.shortcut}</kbd>}
            </div>
          ))}
        </div>
        <div className="quickopen-footer">
          <span className="quickopen-hint">↑↓ navigate · ↵ run · esc close</span>
        </div>
      </div>
    </div>
  );
}
