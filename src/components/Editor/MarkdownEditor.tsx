import { useEffect, useRef } from 'react';
import type { Editor } from '@milkdown/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { buildEditor } from './milkdownConfig';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { dialogService } from '../../services/dialogService';
import { resolveImageSrc, resolveLinkHref } from '../../lib/asset';
import './editor-styles.css';

export function MarkdownEditor() {
  const doc = useDocumentStore((s) => s.doc);
  const openDoc = useDocumentStore((s) => s.open);
  const setDraft = useDocumentStore((s) => s.setDraft);
  const openWs = useWorkspaceStore((s) => s.open);
  const getSession = useConfigStore((s) => s.getSession);
  const recordSession = useConfigStore((s) => s.recordSession);
  const ref = useRef<HTMLDivElement>(null);

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
    };

    void setup().catch(() => {
      if (!disposed) {
        root.innerHTML = '';
      }
    });

    return () => {
      disposed = true;
      mo?.disconnect();
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
    const buttonStyle = {
      fontSize: 13,
      background: 'transparent',
      border: '1px solid var(--border)',
      color: 'var(--fg-primary)',
      borderRadius: 4,
      padding: '8px 14px',
      cursor: 'pointer',
    } as const;

    const pickAndOpenFile = async () => {
      const path = await dialogService.pickMarkdownFile();
      if (path) await openDoc(path);
    };

    const pickAndOpenWorkspace = async () => {
      const path = await dialogService.pickWorkspaceDir();
      if (path) await openWs(path);
    };

    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={pickAndOpenFile} style={buttonStyle}>
            Open File
          </button>
          <button onClick={pickAndOpenWorkspace} style={buttonStyle}>
            Open Workspace
          </button>
        </div>
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
