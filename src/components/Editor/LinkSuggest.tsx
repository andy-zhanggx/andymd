import { useEffect, useRef } from 'react';
import { useLinkSuggestStore } from '../../stores/linkSuggestStore';

/** Popup for `[[` autocomplete; state comes from the linkSuggest plugin. */
export function LinkSuggest() {
  const { open, items, active, loading, x, y, controller, setActive } = useLinkSuggestStore();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open || (!loading && items.length === 0)) return null;

  // Keep the popup on screen: flip above the line near the bottom edge.
  const below = y + 260 < window.innerHeight;
  const style = {
    left: Math.min(x, window.innerWidth - 340),
    ...(below ? { top: y + 4 } : { bottom: window.innerHeight - y + 28 }),
  };

  return (
    <div className="link-suggest" style={style} ref={listRef} role="listbox" aria-label="Link suggestions">
      {loading && <div className="link-suggest-empty">Loading headings…</div>}
      {items.map((item, i) => (
        <div
          key={`${item.kind}:${item.target}:${i}`}
          data-index={i}
          role="option"
          aria-selected={i === active}
          className={`link-suggest-item${i === active ? ' active' : ''}`}
          onMouseEnter={() => setActive(i)}
          onMouseDown={(e) => {
            e.preventDefault();
            controller?.accept(i);
          }}
        >
          <span className={`link-suggest-label${item.kind === 'heading' ? ` h${item.level}` : ''}`}>
            {item.kind === 'heading' ? '# ' : ''}
            {item.label}
          </span>
          <span className="link-suggest-detail">{item.detail}</span>
        </div>
      ))}
      <div className="link-suggest-hint">↑↓ choose · ↵ insert · # heading · | alias · esc</div>
    </div>
  );
}
