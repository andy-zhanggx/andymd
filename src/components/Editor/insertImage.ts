import type { Editor } from '@milkdown/core';
import { editorViewCtx } from '@milkdown/core';
import { dialogService } from '../../services/dialogService';
import { fsService } from '../../services/fsService';
import { useDocumentStore } from '../../stores/documentStore';

function altFromPath(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Open a native image picker and copy the chosen file into the document's
 * `assets/` folder. Returns the document-relative path + a default alt derived
 * from the file name, or null if the user cancelled. Shared by the image
 * placeholder's "Choose image" button and the "Change image" action.
 */
export async function pickAndImportImage(): Promise<{ relPath: string; alt: string } | null> {
  const srcPath = await dialogService.pickImageFile();
  if (!srcPath) return null; // user cancelled
  const docPath = useDocumentStore.getState().doc?.path ?? null;
  try {
    const { relPath } = await fsService.importImage(srcPath, docPath);
    return { relPath, alt: altFromPath(srcPath) };
  } catch (err) {
    window.alert(
      (err as Error)?.message ?? 'Could not import image. Save the document first.',
    );
    return null;
  }
}

/**
 * Insert an image node, optionally at the given viewport coordinates (the drop
 * point); otherwise at the current selection. `src` is stored verbatim on the
 * ProseMirror node (a document-relative path); the MutationObserver in
 * MarkdownEditor rewrites the rendered DOM src to an asset URL for display,
 * while markdown serialization keeps the relative path.
 */
export function insertImageNode(
  editor: Editor,
  src: string,
  alt = '',
  coords?: { left: number; top: number }
): void {
  editor.action((ctx) => {
    const view = ctx.get(editorViewCtx);
    const { state } = view;
    const imageType = state.schema.nodes.image;
    if (!imageType) return;
    // title defaults to '' — the schema validates it as a string, so null would
    // be rejected when the transaction is checked.
    const node = imageType.create({ src, alt, title: '' });

    let tr = state.tr;
    const at = coords ? view.posAtCoords(coords) : null;
    if (at) {
      tr = tr.insert(at.pos, node);
    } else {
      tr = tr.replaceSelectionWith(node, false);
    }
    view.dispatch(tr.scrollIntoView());
    view.focus();
  });
}
