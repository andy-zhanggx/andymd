import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { parseOutline, pickActiveHeading } from '../../lib/outline';
import { getActiveView } from '../Editor/activeView';

function headingEls(): HTMLElement[] {
  const view = getActiveView();
  if (!view) return [];
  return Array.from(view.dom.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'));
}

/** Document outline: clickable heading tree that scrolls the editor. */
export function Outline() {
  const draft = useDocumentStore((s) => s.doc?.draft ?? '');
  const path = useDocumentStore((s) => s.doc?.path ?? null);
  const headings = useMemo(() => parseOutline(draft), [draft]);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Highlight the heading the reader is currently under, as they scroll.
  // Positions are measured with bounding rects relative to the scroller, which
  // stays correct under the editor's CSS zoom (offsetTop does not). Measuring
  // every heading on every scroll frame is O(document) DOM work and makes long
  // documents janky, so rect reads happen only when the cache is invalid —
  // per-scroll updates are pure arithmetic on cached content-space offsets.
  useEffect(() => {
    const scroller = document.querySelector('main');
    if (!scroller) return;
    let raf = 0;
    // Heading tops in scroller content coordinates (viewport-relative top +
    // scrollTop at measure time). Layout changes that move headings without a
    // childList mutation (zoom, font size, images loading) also change the
    // scroller's scrollHeight, which the recompute below checks per scroll.
    let cachedTops: number[] | null = null;
    let cachedScrollHeight = 0;
    const measure = () => {
      const top = scroller.getBoundingClientRect().top;
      const scrolled = scroller.scrollTop;
      cachedTops = headingEls().map((el) => el.getBoundingClientRect().top - top + scrolled);
      cachedScrollHeight = scroller.scrollHeight;
    };
    const recompute = () => {
      raf = 0;
      if (!cachedTops || scroller.scrollHeight !== cachedScrollHeight) measure();
      const scrolled = scroller.scrollTop;
      setActive(pickActiveHeading(cachedTops!.map((t) => t - scrolled)));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(recompute);
    };
    const invalidate = () => {
      cachedTops = null;
      schedule();
    };
    scroller.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', invalidate);
    // The editor builds asynchronously and headings shift as images/math load,
    // so re-measure on DOM changes too (rAF-collapsed with the scroll updates).
    const mo = new MutationObserver(invalidate);
    mo.observe(scroller, { subtree: true, childList: true });
    invalidate();
    return () => {
      scroller.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', invalidate);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [headings.length, path]);

  // Keep the highlighted entry visible inside the outline panel as it moves.
  useEffect(() => {
    if (active < 0) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const go = (index: number) => {
    const el = headingEls()[index];
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  if (headings.length === 0) {
    return <div className="outline-empty">No headings in this document</div>;
  }

  return (
    <div ref={listRef} className="outline" role="tree" aria-label="Document outline">
      {headings.map((h) => (
        <button
          key={h.index}
          type="button"
          role="treeitem"
          className={`outline-item${active === h.index ? ' active' : ''}`}
          style={{ paddingLeft: 10 + (h.level - 1) * 12 }}
          title={h.text}
          onClick={() => go(h.index)}
        >
          {h.text}
        </button>
      ))}
    </div>
  );
}
