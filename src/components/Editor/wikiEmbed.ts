import { parserCtx, schemaCtx } from '@milkdown/core';
import { $nodeSchema, $remark, $inputRule, $view } from '@milkdown/utils';
import { InputRule } from '@milkdown/prose/inputrules';
import { DOMSerializer, type Node as PMNode, type Schema } from '@milkdown/prose/model';
import type { Ctx } from '@milkdown/ctx';
import { isImagePath, resolveVaultFile, splitWikilinkTarget } from '../../lib/wikilink';
import { resolveImageSrc, toAssetUrl } from '../../lib/asset';
import { fsService } from '../../services/fsService';
import { openWikilink } from '../../services/wikilinkService';
import { useWorkspaceStore } from '../../stores/workspaceStore';
import { useDocumentStore } from '../../stores/documentStore';
import { applyBracketLink } from './bracketLinks';

/**
 * Obsidian embeds: `![[pic.png]]`, `![[pic.png|300]]`, `![[note]]`,
 * `![[note#Heading]]`.
 *
 * remark-wiki-link does not recognise the `!` form (micromark reads `![` as
 * an image opener), so the whole thing arrives as literal text — and the
 * default serializer then escapes it to `!\[\[pic.png]]`, corrupting the
 * vault. A transform lifts every `![[…]]` out of text into a `wikiEmbed`
 * node, and a to-markdown handler writes it back verbatim.
 *
 * In the editor an image embed renders as the image; a note embed renders a
 * read-only preview of the note (or just the section under `#Heading`) using
 * this editor's own parser and schema, so math, callouts, tables, … look the
 * same as in the note itself. Embeds inside the preview are not expanded.
 */

interface MdNode {
  type: string;
  value?: string;
  children?: MdNode[];
  [key: string]: unknown;
}

const EMBED = /!\[\[([^[\]\n]+?)\]\]/g;

function splitText(node: MdNode): MdNode[] | null {
  const value = node.value ?? '';
  EMBED.lastIndex = 0;
  if (!EMBED.test(value)) return null;
  EMBED.lastIndex = 0;
  const out: MdNode[] = [];
  let last = 0;
  for (let m = EMBED.exec(value); m; m = EMBED.exec(value)) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) });
    out.push({ type: 'wikiEmbed', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) });
  return out;
}

function transform(node: MdNode): void {
  const children = node.children;
  if (!Array.isArray(children)) return;
  for (let i = 0; i < children.length; i++) {
    const c = children[i];
    if (c.type === 'text') {
      const parts = splitText(c);
      if (parts) {
        children.splice(i, 1, ...parts);
        i += parts.length - 1;
      }
      continue;
    }
    // Code keeps its literal text.
    if (c.type === 'code' || c.type === 'inlineCode') continue;
    transform(c);
  }
}

export const remarkWikiEmbed = $remark(
  'remarkWikiEmbed',
  () =>
    function (this: unknown) {
      const data = (this as { data: () => Record<string, unknown[] | undefined> }).data();
      (data.toMarkdownExtensions ??= []).push({
        handlers: { wikiEmbed: (node: MdNode) => `![[${node.value ?? ''}]]` },
      });
      return (tree: unknown) => transform(tree as MdNode);
    },
);

export const wikiEmbedSchema = $nodeSchema('wiki_embed', () => ({
  group: 'inline',
  inline: true,
  atom: true,
  marks: '',
  attrs: { value: { default: '' } },
  parseDOM: [
    {
      tag: 'span[data-type="wiki_embed"]',
      priority: 100,
      getAttrs: (dom) => ({ value: (dom as HTMLElement).dataset.value ?? '' }),
    },
  ],
  // Static form (clipboard / fallbacks); the live editor uses the NodeView.
  toDOM: (node) => [
    'span',
    { 'data-type': 'wiki_embed', 'data-value': node.attrs.value, class: 'wiki-embed' },
    `![[${node.attrs.value}]]`,
  ],
  parseMarkdown: {
    match: (node) => node.type === 'wikiEmbed',
    runner: (state, node, type) => {
      state.addNode(type, { value: (node.value as string) ?? '' });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === 'wiki_embed',
    runner: (state, node) => {
      state.addNode('wikiEmbed', undefined, node.attrs.value as string);
    },
  },
}));

/** Split `target|option` (Obsidian puts size or alias after the pipe). */
export function parseEmbedValue(value: string): {
  target: string;
  width: number | null;
  height: number | null;
  alias: string | null;
} {
  const pipe = value.indexOf('|');
  const target = (pipe === -1 ? value : value.slice(0, pipe)).trim();
  const opt = pipe === -1 ? '' : value.slice(pipe + 1).trim();
  const size = /^(\d+)(?:x(\d+))?$/.exec(opt);
  return {
    target,
    width: size ? Number(size[1]) : null,
    height: size?.[2] ? Number(size[2]) : null,
    alias: opt && !size ? opt : null,
  };
}

/**
 * The top-level blocks of `doc` under `heading` (up to the next heading of
 * the same or a higher level), or all blocks when `heading` is null.
 * Frontmatter is never embedded.
 */
export function sectionOf(doc: PMNode, heading: string | null): PMNode[] {
  const blocks: PMNode[] = [];
  doc.forEach((n) => {
    if (n.type.name !== 'frontmatter') blocks.push(n);
  });
  if (!heading) return blocks;
  const want = heading.replace(/\s+/g, ' ').trim().toLowerCase();
  const start = blocks.findIndex(
    (n) => n.type.name === 'heading' && n.textContent.replace(/\s+/g, ' ').trim().toLowerCase() === want,
  );
  if (start === -1) return [];
  const level = blocks[start].attrs.level as number;
  let end = start + 1;
  while (end < blocks.length) {
    const n = blocks[end];
    if (n.type.name === 'heading' && (n.attrs.level as number) <= level) break;
    end++;
  }
  return blocks.slice(start, end);
}

function currentTree() {
  return useWorkspaceStore.getState().workspace?.tree ?? null;
}

function currentPath() {
  return useDocumentStore.getState().doc?.path ?? null;
}

function baseName(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.(md|markdown)$/i, '');
}

async function renderNote(
  ctx: Ctx,
  body: HTMLElement,
  path: string,
  heading: string | null,
  isStale: () => boolean,
): Promise<void> {
  let content: string;
  try {
    content = (await fsService.readFile(path)).content;
  } catch {
    if (!isStale()) body.textContent = 'Could not read note.';
    return;
  }
  if (isStale()) return;
  let blocks: PMNode[];
  let serializer: DOMSerializer;
  try {
    const doc = ctx.get(parserCtx)(content);
    blocks = doc ? sectionOf(doc, heading) : [];
    serializer = DOMSerializer.fromSchema(ctx.get(schemaCtx) as Schema);
  } catch {
    // The editor was torn down while the file was loading.
    return;
  }
  body.textContent = '';
  if (blocks.length === 0) {
    body.textContent = heading ? `Heading not found: ${heading}` : 'Empty note.';
    body.classList.add('wiki-embed-empty');
    return;
  }
  try {
    for (const block of blocks) body.appendChild(serializer.serializeNode(block));
  } catch {
    body.textContent = 'Could not render note.';
    return;
  }
  // Relative images inside the embedded note resolve against *its* folder.
  body.querySelectorAll<HTMLImageElement>('img[src]').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    const resolved = resolveImageSrc(src, path);
    if (resolved !== src) img.setAttribute('src', resolved);
  });
}

export const wikiEmbedView = $view(wikiEmbedSchema.node, (ctx) => (initial: PMNode) => {
  let node = initial;
  let renderId = 0;
  const dom = document.createElement('span');
  dom.dataset.type = 'wiki_embed';
  dom.contentEditable = 'false';

  const render = () => {
    const id = ++renderId;
    const value = node.attrs.value as string;
    const { target, width, height } = parseEmbedValue(value);
    const { heading } = splitWikilinkTarget(target);
    dom.dataset.value = value;
    dom.className = 'wiki-embed';
    dom.textContent = '';
    const tree = currentTree();
    const fromPath = currentPath();
    const resolved = tree ? resolveVaultFile(target, tree, fromPath) : null;
    if (!resolved) {
      dom.classList.add('wiki-embed-dead');
      dom.textContent = `![[${value}]]`;
      dom.title = tree ? `Not found in this vault: ${target}` : 'Open the note’s folder to show embeds';
      return;
    }
    dom.removeAttribute('title');
    if (isImagePath(resolved)) {
      dom.classList.add('wiki-embed-image');
      const img = document.createElement('img');
      img.src = toAssetUrl(resolved);
      img.alt = baseName(resolved);
      if (width) img.width = width;
      if (height) img.height = height;
      dom.appendChild(img);
      return;
    }
    if (!/\.(md|markdown)$/i.test(resolved)) {
      dom.classList.add('wiki-embed-file');
      dom.textContent = `📎 ${resolved.split('/').pop()}`;
      return;
    }
    dom.classList.add('wiki-embed-note');
    const header = document.createElement('span');
    header.className = 'wiki-embed-header';
    header.textContent = heading ? `${baseName(resolved)} › ${heading}` : baseName(resolved);
    header.title = 'Open note';
    header.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      void openWikilink(target, currentPath(), { newTab: e.metaKey });
    });
    const body = document.createElement('span');
    body.className = 'wiki-embed-body';
    body.textContent = 'Loading…';
    dom.append(header, body);
    void renderNote(ctx, body, resolved, heading, () => id !== renderId);
  };
  render();

  // Re-resolve when the vault changes (the target may appear / move).
  let prevTree = currentTree();
  const unsub = useWorkspaceStore.subscribe((s) => {
    const tree = s.workspace?.tree ?? null;
    if (tree === prevTree) return;
    prevTree = tree;
    render();
  });

  return {
    dom,
    update: (next: PMNode) => {
      if (next.type !== node.type) return false;
      const changed = next.attrs.value !== node.attrs.value;
      node = next;
      if (changed) render();
      return true;
    },
    stopEvent: (e: Event) => e.type === 'mousedown' && (e.target as HTMLElement).closest?.('.wiki-embed-header') != null,
    ignoreMutation: () => true,
    destroy: () => {
      renderId++;
      unsub();
    },
  };
});

/**
 * Typing the closing `]]` of `[[target|alias]]` / `![[x]]` turns it into a
 * wikilink / embed node (literal text would be saved escaped as `\\[\\[x]]`).
 */
export const bracketLinkInputRule = $inputRule(() =>
  new InputRule(/\]\]$/, (state, _match, _start, end) => {
    // The final `]` is being typed and is not in the doc yet.
    const tr = state.tr.insertText(']', end);
    return applyBracketLink(tr, end + 1) ? tr : null;
  }),
);

export const wikiEmbed = [
  remarkWikiEmbed,
  wikiEmbedSchema,
  wikiEmbedView,
  bracketLinkInputRule,
].flat();
