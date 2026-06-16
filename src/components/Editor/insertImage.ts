import type { Editor } from '@milkdown/core';
import { editorViewCtx } from '@milkdown/core';

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
