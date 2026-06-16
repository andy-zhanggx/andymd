import { $inputRule } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import type { EditorState } from '@milkdown/prose/state';

// Off by default (technical writers often dislike it); toggled from config.
let enabled = false;
export function setSmartPunctuation(on: boolean): void {
  enabled = on;
}

function replaceRule(regexp: RegExp, replacement: string): InputRule {
  return new InputRule(regexp, (state: EditorState, _match, start, end) => {
    if (!enabled) return null;
    // Never rewrite inside code blocks.
    if (state.selection.$from.parent.type.spec.code) return null;
    return state.tr.insertText(replacement, start, end);
  });
}

/**
 * Typora-style smart punctuation: `--` → en dash, `---`/`–-` → em dash,
 * `...` → ellipsis. Straight quotes are intentionally left alone so they don't
 * fight the auto-pair plugin.
 */
export const smartPunctuation = [
  $inputRule(() => replaceRule(/--$/, '–')), // en dash
  $inputRule(() => replaceRule(/–-$/, '—')), // en + - → em dash
  $inputRule(() => replaceRule(/\.\.\.$/, '…')), // ellipsis
];
