import { $prose } from '@milkdown/utils';
import { Plugin, TextSelection } from '@milkdown/prose/state';
import { decidePair } from '../../lib/autoPair';

/**
 * Auto-pair brackets and quotes as you type:
 * - typing an opener inserts the matching closer (caret between)
 * - typing an opener with a selection wraps the selection
 * - typing a closer right before the same closer steps over it
 * Decision logic lives in `lib/autoPair` (unit-tested); this is just wiring.
 */
export const autoPairPlugin = $prose(
  () =>
    new Plugin({
      props: {
        handleTextInput(view, from, to, text) {
          if (text.length !== 1) return false;
          const { state } = view;
          const selectionEmpty = from === to;
          const charBefore = from > 0 ? state.doc.textBetween(from - 1, from) : '';
          const charAfter =
            to < state.doc.content.size ? state.doc.textBetween(to, to + 1) : '';

          const decision = decidePair(text, selectionEmpty, charBefore, charAfter);
          if (!decision) return false;

          if (decision.kind === 'skip') {
            view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, to + 1)));
            return true;
          }

          if (decision.kind === 'close') {
            const tr = state.tr.insertText(decision.open + decision.close, from, to);
            tr.setSelection(TextSelection.create(tr.doc, from + 1));
            view.dispatch(tr);
            return true;
          }

          // wrap
          const selected = state.doc.textBetween(from, to);
          const tr = state.tr.insertText(decision.open + selected + decision.close, from, to);
          tr.setSelection(TextSelection.create(tr.doc, from + 1, from + 1 + selected.length));
          view.dispatch(tr);
          return true;
        },
      },
    }),
);
