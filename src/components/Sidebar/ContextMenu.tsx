import { useEffect } from 'react';
export interface Props { x: number; y: number; path: string; kind: 'file' | 'dir'; onClose: () => void; }

export function ContextMenu({ x, y, path, kind, onClose }: Props) {
  useEffect(() => {
    const off = () => onClose();
    window.addEventListener('click', off);
    return () => window.removeEventListener('click', off);
  }, [onClose]);
  return (
    <div
      style={{
        position: 'fixed',
        top: y,
        left: x,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        padding: 4,
        fontSize: 12,
        zIndex: 1000,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {kind}: {path}
    </div>
  );
}
