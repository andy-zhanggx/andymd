import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { formatZoom, ZOOM_PRESETS } from '../lib/zoom';

/**
 * Acrobat-style zoom control in the status bar: −/+ steppers, the current
 * percentage, and a popover with reading modes (Fit Width, Actual Size) and
 * the zoom preset ladder.
 */
export function ZoomControl() {
  const zoomMode = useUIStore((s) => s.zoomMode);
  const zoom = useUIStore((s) => (s.zoomMode === 'fit-width' ? s.fitWidthZoom : s.zoomLevel));
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  // Dismiss the popover on outside click (same pattern as the stats popover).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const ui = () => useUIStore.getState();

  return (
    <div ref={popRef} className="zoom-control">
      <button
        className="zoom-step"
        onClick={() => ui().zoomStep(-1)}
        aria-label="Zoom out"
        title="Zoom out (⇧⌘−)"
      >
        −
      </button>
      <button
        className="zoom-value"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Zoom level and reading mode"
      >
        {zoomMode === 'fit-width' ? `Fit · ${formatZoom(zoom)}` : formatZoom(zoom)}
      </button>
      <button
        className="zoom-step"
        onClick={() => ui().zoomStep(1)}
        aria-label="Zoom in"
        title="Zoom in (⇧⌘+)"
      >
        +
      </button>
      {open && (
        <div className="zoom-popover" role="menu" aria-label="Zoom">
          <button
            className="zoom-option"
            role="menuitemradio"
            aria-checked={zoomMode === 'fit-width'}
            onClick={() => {
              ui().setFitWidth();
              setOpen(false);
            }}
          >
            Fit Width
            <kbd>⇧⌘2</kbd>
          </button>
          <button
            className="zoom-option"
            role="menuitemradio"
            aria-checked={zoomMode === 'custom' && Math.round(zoom * 100) === 100}
            onClick={() => {
              ui().actualSize();
              setOpen(false);
            }}
          >
            Actual Size
            <kbd>⇧⌘0</kbd>
          </button>
          <div className="zoom-popover-sep" />
          {ZOOM_PRESETS.filter((p) => p >= 50).map((p) => (
            <button
              key={p}
              className="zoom-option"
              role="menuitemradio"
              aria-checked={zoomMode === 'custom' && Math.round(zoom * 100) === p}
              onClick={() => {
                ui().setZoomLevel(p / 100);
                setOpen(false);
              }}
            >
              {p}%
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
