import { useEffect, useRef } from 'react';
import { Editor, editorViewCtx } from '@milkdown/core';
import type { EditorView } from '@milkdown/prose/view';
import { openUrl } from '@tauri-apps/plugin-opener';
import { buildEditor } from './milkdownConfig';
import { FindReplace } from './FindReplace';
import { setActiveView } from './activeView';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { dialogService } from '../../services/dialogService';
import { openWikilink } from '../../services/wikilinkService';
import { resolveImageSrc, resolveLinkHref } from '../../lib/asset';
import './editor-styles.css';

const EDITOR_MAX_WIDTH: Record<string, number | 'none'> = {
  narrow: 620,
  normal: 740,
  wide: 920,
  full: 'none',
};

export function MarkdownEditor() {
  const doc = useDocumentStore((s) => s.doc);
  const openDoc = useDocumentStore((s) => s.open);
  const newDraft = useDocumentStore((s) => s.newDraft);
  const setDraft = useDocumentStore((s) => s.setDraft);
  const openWs = useWorkspaceStore((s) => s.open);
  const getSession = useConfigStore((s) => s.getSession);
  const recordSession = useConfigStore((s) => s.recordSession);
  const { fontSize, lineHeight, fontFamily, editorWidth } = useConfigStore((s) => s.config);
  const ref = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!ref.current || !doc) return;
    const root = ref.current;
    root.innerHTML = '';
    let disposed = false;
    let editor: Editor | undefined;
    let createPromise: Promise<Editor> | undefined;
    let mo: MutationObserver | undefined;
    const scroller = root.closest('main') as HTMLElement | null;
    let scrollTimer: number | null = null;
    let lastScrollTop = scroller?.scrollTop ?? 0;
    const rewrite = () => {
      root.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
        const origin = img.getAttribute('src') || '';
        if (origin.startsWith('asset:') || origin.startsWith('http') || origin.startsWith('data:')) return;
        const resolved = resolveImageSrc(origin, doc.path);
        if (resolved !== origin) img.setAttribute('src', resolved);
      });
    };
    const flushSession = () => {
      if (doc.path) {
        recordSession(doc.path, {
          scrollTop: lastScrollTop,
          selection: { anchor: 0, head: 0 },
          lastAccessedAt: Date.now(),
        });
      }
    };
    const wikilinkClickHandler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest('a[data-type="wikilink"]');
      if (!anchor) return;
      e.preventDefault();
      e.stopPropagation();
      const target = anchor.getAttribute('data-target') || '';
      if (target) void openWikilink(target, doc.path);
    };
    const scrollHandler = () => {
      lastScrollTop = scroller?.scrollTop ?? 0;
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        flushSession();
      }, 500);
    };
    const clickHandler = (e: MouseEvent) => {
      if (!e.metaKey) return;

      const start = e.target instanceof Element
        ? e.target
        : e.target instanceof Node
          ? e.target.parentElement
          : null;
      const anchor = start?.closest<HTMLAnchorElement>('a');
      if (!anchor || !root.contains(anchor)) return;

      const rawHref = anchor.getAttribute('href');
      if (!rawHref) return;

      const resolved = resolveLinkHref(rawHref, doc.path);
      if (resolved.kind === 'external') {
        e.preventDefault();
        e.stopPropagation();
        void openUrl(resolved.href);
      } else if (resolved.kind === 'mdfile') {
        e.preventDefault();
        e.stopPropagation();
        void openDoc(resolved.absPath);
      }
    };

    const setup = async () => {
      createPromise = buildEditor({
        root,
        initialValue: doc.content,
        onChange: (md) => {
          if (!disposed) setDraft(md);
        },
      }).create();
      const created = await createPromise;
      if (disposed) return;

      editor = created;
      try {
        viewRef.current = created.ctx.get(editorViewCtx);
        setActiveView(viewRef.current);
      } catch {
        viewRef.current = null;
      }
      mo = new MutationObserver(() => rewrite());
      mo.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src'],
      });
      rewrite();
      root.addEventListener('click', clickHandler);

      if (doc.path && scroller) {
        const saved = getSession(doc.path);
        if (saved) {
          requestAnimationFrame(() => {
            if (!disposed) {
              scroller.scrollTop = saved.scrollTop;
            }
          });
        }
      }

      scroller?.addEventListener('scroll', scrollHandler, { passive: true });
      root.addEventListener('click', wikilinkClickHandler);
    };

    void setup().catch(() => {
      if (!disposed) {
        root.innerHTML = '';
      }
    });

    return () => {
      disposed = true;
      viewRef.current = null;
      setActiveView(null);
      mo?.disconnect();
      root.removeEventListener('click', wikilinkClickHandler);
      root.removeEventListener('click', clickHandler);
      scroller?.removeEventListener('scroll', scrollHandler);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      flushSession();
      void (async () => {
        try {
          const instance = editor ?? await createPromise?.catch(() => undefined);
          try {
            await instance?.destroy();
          } catch {
            // Best-effort cleanup during StrictMode remounts.
          }
        } finally {
          root.innerHTML = '';
        }
      })();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.path]);

  if (!doc) {
    const pickAndOpenFile = async () => {
      const path = await dialogService.pickMarkdownFile();
      if (path) await openDoc(path);
    };

    const pickAndOpenWorkspace = async () => {
      const path = await dialogService.pickWorkspaceDir();
      if (path) await openWs(path);
    };

    return (
      <div className="empty-state">
        <div className="empty-mark">andy.md</div>
        <div className="empty-actions">
          <button className="empty-action" onClick={() => newDraft()}>
            <span>New Document</span>
            <kbd>⌘N</kbd>
          </button>
          <button className="empty-action" onClick={pickAndOpenFile}>
            <span>Open File…</span>
            <kbd>⌘O</kbd>
          </button>
          <button className="empty-action" onClick={pickAndOpenWorkspace}>
            <span>Open Folder…</span>
            <kbd>⇧⌘O</kbd>
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <FindReplace getView={() => viewRef.current} />
      <div
        className="editor-container"
        style={{
          maxWidth: EDITOR_MAX_WIDTH[editorWidth] ?? 740,
          margin: '0 auto',
          padding: '32px 24px 30vh',
          fontSize,
          lineHeight,
          fontFamily,
        }}
        ref={ref}
      />
    </>
  );
}
