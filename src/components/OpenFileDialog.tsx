import { useEffect, useMemo, useRef, useState } from 'react';
import { useWorkspaceStore } from '../stores/workspaceStore';
import { useDocumentStore } from '../stores/documentStore';
import { useUIStore } from '../stores/uiStore';
import { dialogService } from '../services/dialogService';
import { fsService } from '../services/fsService';
import { flattenFiles, filterFiles, createTarget, type FlatFile } from '../lib/quickOpen';

type Item =
  | { kind: 'create'; name: string }
  | { kind: 'file'; file: FlatFile };

function joinPath(root: string, name: string): string {
  return `${root.replace(/\/+$/, '')}/${name.replace(/^\/+/, '')}`;
}

export function OpenFileDialog() {
  const open = useUIStore((s) => s.openFileDialog);
  const setOpen = useUIStore((s) => s.setOpenFileDialog);
  const workspace = useWorkspaceStore((s) => s.workspace);
  const refresh = useWorkspaceStore((s) => s.refresh);
  const openDoc = useDocumentStore((s) => s.open);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const files = useMemo(
    () => (workspace ? flattenFiles(workspace.tree, workspace.root) : []),
    [workspace]
  );

  const items: Item[] = useMemo(() => {
    const matches = filterFiles(files, query);
    const target = createTarget(query, files);
    const list: Item[] = [];
    if (target && !target.exists) list.push({ kind: 'create', name: target.name });
    for (const file of matches) list.push({ kind: 'file', file });
    return list;
  }, [files, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    setActive((i) => Math.min(i, Math.max(0, items.length - 1)));
  }, [items.length]);

  if (!open) return null;

  const close = () => setOpen(false);

  const activate = async (item: Item) => {
    if (item.kind === 'file') {
      close();
      await openDoc(item.file.path);
      return;
    }
    if (!workspace) return;
    const abs = joinPath(workspace.root, item.name);
    close();
    try {
      // writeFile creates intermediate directories atomically.
      await fsService.writeFile(abs, '');
      await refresh();
      await openDoc(abs);
    } catch (err) {
      window.alert((err as Error)?.message ?? 'Failed to create file.');
    }
  };

  const browseNative = async () => {
    close();
    const file = await dialogService.pickMarkdownFile();
    if (file) await openDoc(file);
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
      const item = items[active];
      if (item) void activate(item);
    }
  };

  return (
    <div className="quickopen-backdrop" onMouseDown={close}>
      <div
        className="quickopen"
        role="dialog"
        aria-label="Open or create file"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="quickopen-input"
          placeholder={workspace ? 'Open a file or type a name to create…' : 'Open a file…'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="quickopen-list" ref={listRef}>
          {items.length === 0 && (
            <div className="quickopen-empty">
              {workspace ? 'No matching files' : 'No folder open'}
            </div>
          )}
          {items.map((item, i) => {
            const key = item.kind === 'create' ? `create:${item.name}` : item.file.path;
            const cls = i === active ? 'quickopen-item active' : 'quickopen-item';
            return (
              <div
                key={key}
                className={cls}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onClick={() => void activate(item)}
              >
                {item.kind === 'create' ? (
                  <>
                    <span className="quickopen-badge">New</span>
                    <span className="quickopen-name">Create “{item.name}”</span>
                  </>
                ) : (
                  <>
                    <span className="quickopen-name">{item.file.name}</span>
                    {item.file.relPath !== item.file.name && (
                      <span className="quickopen-path">{item.file.relPath}</span>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
        <div className="quickopen-footer">
          <span className="quickopen-hint">↑↓ navigate · ↵ open · esc close</span>
          <button className="quickopen-browse" onClick={browseNative}>
            Browse…
          </button>
        </div>
      </div>
    </div>
  );
}
