import { useEffect, useMemo, useState } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { parseOutline } from '../../lib/outline';
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

  // Highlight the heading the reader is currently under, as they scroll.
  useEffect(() => {
    const scroller = document.querySelector('main');
    if (!scroller) return;
    const onScroll = () => {
      const els = headingEls();
      const top = scroller.scrollTop;
      let idx = -1;
      els.forEach((el, i) => {
        if (el.offsetTop - 16 <= top) idx = i;
      });
      setActive(idx);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => scroller.removeEventListener('scroll', onScroll);
  }, [headings.length, path]);

  const go = (index: number) => {
    const el = headingEls()[index];
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  if (headings.length === 0) {
    return <div className="outline-empty">No headings in this document</div>;
  }

  return (
    <div className="outline" role="tree" aria-label="Document outline">
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
