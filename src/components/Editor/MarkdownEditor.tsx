import { useEffect, useRef } from 'react';
import { buildEditor } from './milkdownConfig';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { resolveImageSrc } from '../../lib/asset';
import './editor-styles.css';

export function MarkdownEditor() {
  const doc = useDocumentStore((s) => s.doc);
  const setDraft = useDocumentStore((s) => s.setDraft);
  const getSession = useConfigStore((s) => s.getSession);
  const recordSession = useConfigStore((s) => s.recordSession);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !doc) return;
    const root = ref.current;
    root.innerHTML = '';
    let disposed = false;
    const editor = buildEditor({
      root,
      initialValue: doc.content,
      onChange: (md) => {
        if (!disposed) setDraft(md);
      },
    });
    editor.create();

    const rewrite = () => {
      root.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
        const origin = img.getAttribute('src') || '';
        if (origin.startsWith('asset:') || origin.startsWith('http') || origin.startsWith('data:')) return;
        const resolved = resolveImageSrc(origin, doc.path);
        if (resolved !== origin) img.setAttribute('src', resolved);
      });
    };
    const mo = new MutationObserver(() => rewrite());
    mo.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
    rewrite();

    const scroller = root.closest('main') as HTMLElement | null;

    if (doc.path && scroller) {
      const saved = getSession(doc.path);
      if (saved) {
        requestAnimationFrame(() => {
          scroller.scrollTop = saved.scrollTop;
        });
      }
    }

    let scrollTimer: number | null = null;
    let lastScrollTop = scroller?.scrollTop ?? 0;
    const scrollHandler = () => {
      lastScrollTop = scroller?.scrollTop ?? 0;
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        if (doc.path) {
          recordSession(doc.path, {
            scrollTop: lastScrollTop,
            selection: { anchor: 0, head: 0 },
            lastAccessedAt: Date.now(),
          });
        }
      }, 500);
    };
    scroller?.addEventListener('scroll', scrollHandler, { passive: true });

    return () => {
      disposed = true;
      mo.disconnect();
      scroller?.removeEventListener('scroll', scrollHandler);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      if (doc.path) {
        recordSession(doc.path, {
          scrollTop: lastScrollTop,
          selection: { anchor: 0, head: 0 },
          lastAccessedAt: Date.now(),
        });
      }
      root.innerHTML = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.path]);

  if (!doc) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--fg-muted)' }}>
        Open a file from the sidebar or press ⌘O
      </div>
    );
  }

  return (
    <div
      className="editor-container"
      style={{ maxWidth: 740, margin: '0 auto', padding: '32px 24px' }}
      ref={ref}
    />
  );
}
