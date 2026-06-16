import { useEffect, useRef } from 'react';
import type { Editor } from '@milkdown/core';
import { openUrl } from '@tauri-apps/plugin-opener';
import { buildEditor } from './milkdownConfig';
import { insertImageNode } from './insertImage';
import { Toolbar } from './Toolbar';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUIStore } from '../../stores/uiStore';
import { dialogService } from '../../services/dialogService';
import { fsService } from '../../services/fsService';
import { openWikilink } from '../../services/wikilinkService';
import { resolveImageSrc, resolveLinkHref } from '../../lib/asset';
import { isImageFile } from '../../lib/image';
import './editor-styles.css';

function altFromPath(path: string): string {
  const base = path.split('/').pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

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
  const editorRef = useRef<Editor | null>(null);

  // Handle image drops at the DOM level. Tauri's native drag interception is
  // disabled (dragDropEnabled: false), so the webview receives the HTML5 drop
  // with real File objects. We intercept in the capture phase — before
  // ProseMirror inserts its own broken placeholder — read the bytes, write them
  // into assets/ next to the document, and insert a proper image node at the
  // drop point.
  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onDragOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };

    const onDrop = async (e: DragEvent) => {
      const images = Array.from(e.dataTransfer?.files ?? []).filter(isImageFile);
      if (images.length === 0) return; // let ProseMirror handle non-image drops
      e.preventDefault();
      e.stopPropagation();

      const editor = editorRef.current;
      const current = useDocumentStore.getState().doc;
      if (!editor || !current) {
        window.alert('Open a document before dropping images.');
        return;
      }
      const coords = { left: e.clientX, top: e.clientY };
      for (const file of images) {
        try {
          const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
          const { relPath } = await fsService.importImageBytes(file.name, bytes, current.path);
          insertImageNode(editor, relPath, altFromPath(file.name), coords);
        } catch (err) {
          window.alert(
            (err as Error)?.message ?? 'Failed to import image. Save the document first.'
          );
          break;
        }
      }
    };

    root.addEventListener('dragover', onDragOver, true);
    root.addEventListener('drop', onDrop, true);
    return () => {
      root.removeEventListener('dragover', onDragOver, true);
      root.removeEventListener('drop', onDrop, true);
    };
  }, []);

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
      editorRef.current = created;
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
      editorRef.current = null;
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
      if (useWorkspaceStore.getState().workspace) {
        useUIStore.getState().setOpenFileDialog(true);
        return;
      }
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
      <Toolbar getEditor={() => editorRef.current} />
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
