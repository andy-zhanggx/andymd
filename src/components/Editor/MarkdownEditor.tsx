import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor, editorViewCtx } from '@milkdown/core';
import { getMarkdown } from '@milkdown/utils';
import { collabServiceCtx } from '@milkdown/plugin-collab';
import type { EditorView } from '@milkdown/prose/view';
import { buildEditor } from './milkdownConfig';
import { useCollabStore, getActiveSession } from '../../collab/collabStore';
import { ONLINE_COLLAB } from '../../featureFlags';
import { cursorBuilder, selectionBuilder } from '../../collab/cursor';
import { insertImageNode } from './insertImage';
import { Toolbar } from './Toolbar';
import { FindReplace } from './FindReplace';
import { EditorBuildError } from './EditorBuildError';
import { setActiveView } from './activeView';
import { setTypewriter } from './viewModePlugin';
import { setSmartPunctuation } from './smartPunctuation';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useUIStore } from '../../stores/uiStore';
import { dialogService } from '../../services/dialogService';
import { fsService } from '../../services/fsService';
import { resolveImageSrc } from '../../lib/asset';
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
  const newFile = useDocumentStore((s) => s.newFile);
  const setDraft = useDocumentStore((s) => s.setDraft);
  const openWs = useWorkspaceStore((s) => s.open);
  const getSession = useConfigStore((s) => s.getSession);
  const recordSession = useConfigStore((s) => s.recordSession);
  const { fontSize, lineHeight, fontFamily, editorWidth, spellcheck, autoSave, smartPunctuation } =
    useConfigStore((s) => s.config);
  const sourceMode = useUIStore((s) => s.sourceMode);
  const focusMode = useUIStore((s) => s.focusMode);
  const typewriterMode = useUIStore((s) => s.typewriterMode);
  const roomCode = useCollabStore((s) => s.roomCode);
  const collabRole = useCollabStore((s) => s.role);
  // Online collaboration is feature-flagged off by default. When disabled the
  // editor never enters collab mode, so no Y.Doc is bound and no WebSocket is
  // opened — it stays a plain offline editor driven by the local draft.
  const collabActive = ONLINE_COLLAB && roomCode !== null;
  const ref = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // When the async editor build rejects we surface this instead of silently
  // leaving a blank pane; bumping `reloadKey` re-runs the build effect.
  const [buildError, setBuildError] = useState<Error | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Handle image drops at the DOM level. Tauri's native drag interception is
  // disabled (dragDropEnabled: false), so the webview receives the HTML5 drop
  // with real File objects. We intercept in the capture phase — before
  // ProseMirror inserts its own broken placeholder — read the bytes, write them
  // into assets/ next to the document, and insert a proper image node at the
  // drop point.
  //
  // The listeners are wired via a callback ref rather than a mount-time effect:
  // the editor container is conditionally rendered (it's absent on the empty
  // state and in source mode), so a `useEffect(…, [])` would attach to a null
  // root and never re-run when the real container later mounts — leaving drop
  // dead in the normal "launch → open file" flow. The callback ref fires
  // exactly when the node mounts/unmounts, independent of the doc churn (a new
  // `doc` object is created on every keystroke).
  const onDragOver = useCallback((e: DragEvent) => {
    if (Array.from(e.dataTransfer?.types ?? []).includes('Files')) e.preventDefault();
  }, []);

  const onDrop = useCallback(async (e: DragEvent) => {
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
  }, []);

  const setEditorRoot = useCallback((node: HTMLDivElement | null) => {
    const prev = ref.current;
    if (prev) {
      prev.removeEventListener('dragover', onDragOver, true);
      prev.removeEventListener('drop', onDrop, true);
    }
    ref.current = node;
    if (node) {
      node.addEventListener('dragover', onDragOver, true);
      node.addEventListener('drop', onDrop, true);
    }
  }, [onDragOver, onDrop]);

  useEffect(() => {
    if (!ref.current || !doc) return;
    const root = ref.current;
    root.innerHTML = '';
    // Clear any prior failure: we're (re)building, so the fallback must go and
    // the mount point must be visible for the new editor to attach to.
    setBuildError(null);
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
    // NOTE: link navigation (markdown links + wikilinks) is handled inside the
    // editor by the linkTooltip plugin's `handleClickOn`. A document-level
    // `click` listener cannot be used: WKWebView does not dispatch `click` for a
    // plain click on an editable `<a>` (only ⌘-click), which is exactly why
    // links used to "need ⌘". ProseMirror's click handling is mousedown-based
    // and fires on a plain click.
    const scrollHandler = () => {
      lastScrollTop = scroller?.scrollTop ?? 0;
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(() => {
        flushSession();
      }, 500);
    };

    const setup = async () => {
      createPromise = buildEditor({
        root,
        // In collab mode the content is driven by the shared Y.Doc, so we start
        // empty; otherwise seed from the live buffer (not on-disk content) so
        // round-tripping through source mode preserves unsaved edits.
        initialValue: collabActive ? '' : doc.draft,
        spellcheck,
        collab: collabActive,
        onChange: (md) => {
          if (!disposed) setDraft(md);
        },
      }).create();
      const created = await createPromise;
      if (disposed) return;

      editor = created;
      editorRef.current = created;
      try {
        viewRef.current = created.ctx.get(editorViewCtx);
        setActiveView(viewRef.current);
      } catch {
        viewRef.current = null;
      }

      // Wire the collaboration service to the active session's Y.Doc + awareness.
      // The host seeds the room from the local document once, and only if the
      // server copy is still empty (applyTemplate's guard) — this prevents
      // duplicated content when reconnecting to a persisted room. Guests never
      // seed; their content arrives over the wire.
      if (collabActive) {
        const session = getActiveSession();
        if (session?.awareness) {
          const seed = doc.draft;
          const isHost = collabRole === 'host';
          created.action((ctx) => {
            const collabService = ctx.get(collabServiceCtx);
            collabService
              .bindDoc(session.doc)
              .setAwareness(session.awareness!)
              .setOptions({ yCursorOpts: { cursorBuilder, selectionBuilder } });
          });
          void session.whenSynced().then(() => {
            if (disposed) return;
            created.action((ctx) => {
              const collabService = ctx.get(collabServiceCtx);
              // applyTemplate's default guard seeds only when the shared doc is
              // empty (textContent.length === 0), so a host reconnecting to a
              // persisted room won't duplicate content. Guests never seed.
              if (isHost) collabService.applyTemplate(seed);
              collabService.connect();
            });
          }).catch((err) => {
            console.error('[collab] failed to bind editor to session', err);
          });
        }
      }
      mo = new MutationObserver(() => rewrite());
      mo.observe(root, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src'],
      });
      rewrite();

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

      // A freshly created / empty document otherwise mounts as a blank pane with
      // no caret, so it's not obvious where to type. Focus the editor so the
      // cursor is visible and the user can start typing immediately. (Existing
      // files are left unfocused to preserve their restored scroll position.)
      if (!doc.path || doc.draft.trim() === '') {
        requestAnimationFrame(() => {
          if (!disposed) viewRef.current?.focus();
        });
      }

      scroller?.addEventListener('scroll', scrollHandler, { passive: true });
    };

    void setup().catch((err) => {
      if (disposed) return;
      // Don't swallow it: log for diagnosis and show a recoverable fallback
      // instead of a blank, uneditable pane with no indication of what failed.
      console.error('[editor] failed to build the Milkdown editor', err);
      root.innerHTML = '';
      setBuildError(err instanceof Error ? err : new Error(String(err)));
    });

    return () => {
      disposed = true;
      editorRef.current = null;
      viewRef.current = null;
      setActiveView(null);
      mo?.disconnect();
      scroller?.removeEventListener('scroll', scrollHandler);
      if (scrollTimer) window.clearTimeout(scrollTimer);
      flushSession();
      // Flush the editor's latest markdown before it's torn down. The change
      // listener is debounced, so the most recent edit (e.g. an image resize)
      // may not have reached the store yet. Stash it in memory keyed by path so
      // switching files/views never loses unsaved work; and if we're staying on
      // the same document (a view/mode toggle), sync the live draft too so
      // source view reflects the latest edit.
      if (editor && !collabActive && doc) {
        try {
          const md = editor.action(getMarkdown());
          if (doc.path) useDocumentStore.getState().stashDraft(doc.path, md);
          const cur = useDocumentStore.getState().doc;
          if (cur && cur.path === doc.path) setDraft(md);
        } catch {
          // editor already disposed — nothing to flush
        }
      }
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
  }, [doc?.path, sourceMode, collabActive, roomCode, reloadKey]);

  // Keep the typewriter plugin's module flag in sync with UI state.
  useEffect(() => {
    setTypewriter(typewriterMode);
  }, [typewriterMode]);

  // Keep smart-punctuation in sync with config.
  useEffect(() => {
    setSmartPunctuation(smartPunctuation);
  }, [smartPunctuation]);

  // Toggle native spell-checking live (without rebuilding the editor).
  useEffect(() => {
    viewRef.current?.dom.setAttribute('spellcheck', String(spellcheck));
  }, [spellcheck]);

  // Debounced auto-save for files on disk.
  useEffect(() => {
    if (!autoSave || !doc?.path || !doc.isDirty) return;
    const t = window.setTimeout(() => {
      void useDocumentStore.getState().save().catch(() => {
        /* external-modification or IO error — leave it to manual save */
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [autoSave, doc?.draft, doc?.path, doc?.isDirty]);

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
          <button className="empty-action" onClick={() => void newFile()}>
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

  if (sourceMode) {
    return (
      <textarea
        className="source-editor"
        value={doc.draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        style={{ fontSize, lineHeight }}
        aria-label="Markdown source"
      />
    );
  }

  return (
    <>
      <Toolbar getEditor={() => editorRef.current} />
      <FindReplace getView={() => viewRef.current} />
      {buildError && (
        <EditorBuildError
          message={buildError.message}
          onReload={() => setReloadKey((k) => k + 1)}
        />
      )}
      {/* Keep the mount point in the tree even while the fallback shows, so a
          reload can rebuild the editor into it. Hidden under the fallback. */}
      <div
        className={`editor-container${focusMode ? ' focus-mode' : ''}${
          typewriterMode ? ' typewriter-mode' : ''
        }`}
        style={{
          maxWidth: EDITOR_MAX_WIDTH[editorWidth] ?? 740,
          margin: '0 auto',
          padding: '32px 24px 30vh',
          fontSize,
          lineHeight,
          fontFamily,
          display: buildError ? 'none' : undefined,
        }}
        ref={setEditorRoot}
      />
    </>
  );
}
