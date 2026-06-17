import { $prose } from '@milkdown/utils';
import { Plugin } from '@milkdown/prose/state';
import { Decoration, DecorationSet } from '@milkdown/prose/view';

// Typewriter scrolling is opt-in; focus dimming is pure CSS (driven by the
// `.focused` decoration this plugin always paints + a `.typewriter-mode` /
// `.focus-mode` class on the container). A module flag lets the imperative
// scroll logic know when typewriter mode is on without a React dependency.
let typewriter = false;
export function setTypewriter(on: boolean): void {
  typewriter = on;
}

function centerCaret(view: { coordsAtPos: (p: number) => { top: number }; state: any; dom: HTMLElement }) {
  const scroller = view.dom.closest('main');
  if (!scroller) return;
  const head = view.state.selection.head;
  let coords;
  try {
    coords = view.coordsAtPos(head);
  } catch {
    return;
  }
  const rect = scroller.getBoundingClientRect();
  const desiredCenter = rect.top + scroller.clientHeight / 2;
  scroller.scrollTop += coords.top - desiredCenter;
}

/**
 * Decorates the top-level block containing the caret with `.focused` (so focus
 * mode can dim everything else via CSS) and, when typewriter mode is on,
 * keeps the caret vertically centered.
 */
export const viewModePlugin = $prose(
  () =>
    new Plugin({
      props: {
        decorations(state) {
          const { $head } = state.selection;
          if ($head.depth < 1) return DecorationSet.empty;
          const start = $head.before(1);
          const node = $head.node(1);
          return DecorationSet.create(state.doc, [
            Decoration.node(start, start + node.nodeSize, { class: 'focused' }),
          ]);
        },
      },
      view: () => ({
        update(view, prev) {
          if (!typewriter) return;
          const selChanged = !view.state.selection.eq(prev.selection);
          const docChanged = !view.state.doc.eq(prev.doc);
          if (selChanged || docChanged) centerCaret(view as never);
        },
      }),
    }),
);
