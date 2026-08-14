import { $remark } from '@milkdown/utils';

/**
 * Shield non-text literals from the twemoji remark transform.
 *
 * @milkdown/plugin-emoji's twemoji pass rewrites ANY literal mdast node whose
 * value matches emoji-regex (only `code` is exempt). That is fine for `text`,
 * and our htmlComment/htmlMerge transformers deliberately re-stitch the
 * fragments it makes of `html`. But for other literals it corrupts content:
 * a `↔` inside `$$` math split the block-level `math` node into
 * math + emoji + math, leaving an inline `emoji` node directly under `doc` —
 * "Cannot create node for doc", and the document refused to open. The same
 * split applies to `yaml` frontmatter (also block-level → same crash) and
 * `inlineCode` (silent content corruption).
 *
 * The guard is a protect/restore pair wrapped around `.use(emoji)`: protect
 * stashes the value of each shielded literal and blanks it (the twemoji pass
 * skips falsy values), restore puts it back. Only the emoji plugin's remark
 * passes run in between.
 */

const SHIELDED = new Set(['math', 'inlineMath', 'inlineCode', 'yaml']);
const STASH = '__emojiGuardValue';

interface MdastNode {
  type: string;
  value?: unknown;
  children?: MdastNode[];
  [STASH]?: string;
}

function walk(node: MdastNode, fn: (n: MdastNode) => void): void {
  fn(node);
  if (Array.isArray(node.children)) for (const c of node.children) walk(c, fn);
}

export const emojiGuardProtect = $remark('emojiGuardProtect', () => () => (tree: unknown) => {
  walk(tree as MdastNode, (n) => {
    if (SHIELDED.has(n.type) && typeof n.value === 'string' && n.value.length > 0) {
      n[STASH] = n.value;
      n.value = '';
    }
  });
});

export const emojiGuardRestore = $remark('emojiGuardRestore', () => () => (tree: unknown) => {
  walk(tree as MdastNode, (n) => {
    if (typeof n[STASH] === 'string') {
      n.value = n[STASH];
      delete n[STASH];
    }
  });
});
