import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { openMarkdownLink } from '../../services/linkService';
import { openWikilink } from '../../services/wikilinkService';

export interface LinkMenuTarget {
  /** 'wikilink' carries the raw `data-target`; 'markdown' carries the `href`. */
  kind: 'wikilink' | 'markdown';
  value: string;
  /** Path of the document the link lives in, for relative resolution. */
  fromPath: string | null;
  x: number;
  y: number;
}

interface Props extends LinkMenuTarget {
  onClose: () => void;
}

export function LinkContextMenu({ kind, value, fromPath, x, y, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  useEffect(() => {
    const off = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('click', off);
    window.addEventListener('contextmenu', off);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', off);
      window.removeEventListener('contextmenu', off);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Keep the menu inside the viewport when invoked near an edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      x: Math.max(4, Math.min(x, window.innerWidth - rect.width - 4)),
      y: Math.max(4, Math.min(y, window.innerHeight - rect.height - 4)),
    });
  }, [x, y]);

  const follow = (newTab: boolean) => {
    if (kind === 'wikilink') void openWikilink(value, fromPath, { newTab });
    else void openMarkdownLink(value, fromPath, { newTab });
  };

  const items: { label: string; action: () => void }[] = [
    { label: 'Open in This Window', action: () => follow(false) },
    { label: 'Open in New Tab', action: () => follow(true) },
    { label: 'Copy Link', action: () => void navigator.clipboard.writeText(value).catch(() => {}) },
  ];

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      style={{ top: pos.y, left: pos.x }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((it, i) => (
        <div
          key={i}
          className="context-menu-item"
          role="menuitem"
          onClick={() => {
            it.action();
            onClose();
          }}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}
