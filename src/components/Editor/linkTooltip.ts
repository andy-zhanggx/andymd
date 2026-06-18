import { $prose } from '@milkdown/utils';
import { Plugin } from '@milkdown/prose/state';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import type { Node as PMNode } from '@milkdown/prose/model';
import { openMarkdownLink } from '../../services/linkService';
import { openWikilink } from '../../services/wikilinkService';
import { useDocumentStore } from '../../stores/documentStore';

/**
 * Link clicking + a hover tooltip for editing links.
 *
 * Two problems this solves:
 *
 * 1. **Plain-click follow.** WebKit (the Tauri WKWebView) does not dispatch a
 *    `click` event for a plain click on an `<a>` inside `contenteditable` — only
 *    ⌘-click navigates. A document-level click listener therefore never fires,
 *    which is why links "needed ⌘". ProseMirror's own `handleClickOn` is driven
 *    by mousedown/mouseup (not the suppressed `click`), so it fires on a plain
 *    click; we follow the link there. Works for both wikilinks (atom nodes) and
 *    markdown links (the `link` mark).
 *
 * 2. **Editing the destination.** Hovering a link pops a small card showing its
 *    target with Open / Edit / Remove. "Edit" exposes the link **text** and the
 *    **target/URL** so both can be changed in place — previously a markdown
 *    link's text could only be retyped and its href could not be edited at all,
 *    and wikilinks had no editing affordance.
 */

function docPath(): string | null {
  return useDocumentStore.getState().doc?.path ?? null;
}

/** The doc range a link mark spans around `pos`, plus its href, or null. */
export function linkMarkRangeAt(
  state: EditorState,
  pos: number,
): { from: number; to: number; href: string; text: string } | null {
  const linkType = state.schema.marks.link;
  if (!linkType) return null;
  const $pos = state.doc.resolve(pos);
  const mark =
    linkType.isInSet($pos.marks()) ||
    (($pos.nodeAfter && linkType.isInSet($pos.nodeAfter.marks)) || null) ||
    (($pos.nodeBefore && linkType.isInSet($pos.nodeBefore.marks)) || null);
  if (!mark) return null;

  const parent = $pos.parent;
  const parentStart = $pos.start();
  let from = -1;
  let to = -1;
  let offset = 0;
  parent.forEach((child) => {
    const childFrom = parentStart + offset;
    const childTo = childFrom + child.nodeSize;
    if (mark.isInSet(child.marks)) {
      if (from === -1) from = childFrom;
      to = childTo;
    } else if (from !== -1 && childFrom <= pos) {
      from = -1;
      to = -1;
    }
    offset += child.nodeSize;
  });
  if (from === -1) return null;
  return {
    from,
    to,
    href: (mark.attrs.href as string) ?? '',
    text: state.doc.textBetween(from, to),
  };
}

/**
 * Replace the link occupying [from, to) with `text` carrying a link mark whose
 * href is `href`. Returns the transaction (also dispatched by the caller).
 */
export function buildLinkEdit(
  state: EditorState,
  from: number,
  to: number,
  text: string,
  href: string,
): Transaction {
  const linkType = state.schema.marks.link;
  const safeText = text.length > 0 ? text : href;
  let tr = state.tr.insertText(safeText, from, to);
  const end = from + safeText.length;
  if (linkType) {
    tr = tr.removeMark(from, end, linkType);
    tr = tr.addMark(from, end, linkType.create({ href }));
  }
  return tr;
}

/** Find the wikilink atom node for a hovered/clicked `<a data-type=wikilink>`. */
function wikilinkNodeAt(
  view: EditorView,
  anchor: HTMLElement,
): { pos: number; node: PMNode } | null {
  let pos: number;
  try {
    pos = view.posAtDOM(anchor, 0);
  } catch {
    return null;
  }
  const { doc } = view.state;
  for (const p of [pos, pos - 1, pos + 1]) {
    if (p < 0 || p > doc.content.size) continue;
    const node = doc.nodeAt(p);
    if (node?.type.name === 'wikilink') return { pos: p, node };
  }
  return null;
}

type LinkInfo =
  | { kind: 'wikilink'; nodePos: number; nodeSize: number; target: string; alias: string }
  | { kind: 'markdown'; from: number; to: number; href: string; text: string };

const HIDE_DELAY = 200;

class LinkTooltipView {
  private tip: HTMLElement;
  private row: HTMLElement;
  private urlEl: HTMLAnchorElement;
  private form: HTMLElement;
  private destLabel: HTMLElement;
  private textInput: HTMLInputElement;
  private destInput: HTMLInputElement;
  private hideTimer: number | null = null;
  private anchorRect: DOMRect | null = null;
  private info: LinkInfo | null = null;

  constructor(private view: EditorView) {
    const tip = document.createElement('div');
    tip.className = 'link-tooltip';
    tip.setAttribute('contenteditable', 'false');
    tip.style.display = 'none';

    const row = document.createElement('div');
    row.className = 'link-tooltip-row';
    const url = document.createElement('a');
    url.className = 'link-tooltip-url';
    const editBtn = iconButton('Edit link', PENCIL);
    const removeBtn = iconButton('Remove link', UNLINK);
    row.append(url, editBtn, removeBtn);

    const form = document.createElement('div');
    form.className = 'link-tooltip-form';
    form.style.display = 'none';
    const textInput = field('Text');
    const destInput = field('https://');
    const textLabel = labelled('Text', textInput);
    const destWrap = labelled('Link', destInput);
    const destLabel = destWrap.querySelector('span')!;
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'link-tooltip-save';
    saveBtn.textContent = 'Save';
    form.append(textLabel, destWrap, saveBtn);

    tip.append(row, form);
    document.body.appendChild(tip);

    this.tip = tip;
    this.row = row;
    this.urlEl = url;
    this.form = form;
    this.destLabel = destLabel;
    this.textInput = textInput;
    this.destInput = destInput;

    tip.addEventListener('mouseenter', this.cancelHide);
    tip.addEventListener('mouseleave', this.scheduleHide);
    url.addEventListener('click', this.onOpen);
    editBtn.addEventListener('click', this.onEnterEdit);
    removeBtn.addEventListener('click', this.onRemove);
    saveBtn.addEventListener('click', this.onSave);
    this.destInput.addEventListener('keydown', this.onFormKey);
    this.textInput.addEventListener('keydown', this.onFormKey);

    view.dom.addEventListener('mouseover', this.onMouseOver);
    view.dom.addEventListener('mouseout', this.onMouseOut);
  }

  private onMouseOver = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.('a');
    if (!anchor || !this.view.dom.contains(anchor)) return;
    this.cancelHide();
    this.showFor(anchor as HTMLAnchorElement);
  };

  private onMouseOut = (e: MouseEvent) => {
    const to = e.relatedTarget;
    if (to instanceof HTMLElement && to.closest('a')) return; // moved within a link
    this.scheduleHide();
  };

  private showFor(anchor: HTMLAnchorElement) {
    if (this.form.style.display !== 'none') return; // don't disrupt an open edit
    const info = this.resolve(anchor);
    if (!info) return;
    this.info = info;
    this.anchorRect = anchor.getBoundingClientRect();
    if (info.kind === 'wikilink') {
      this.urlEl.textContent = info.target;
      this.urlEl.removeAttribute('href');
      this.textInput.value = info.alias || info.target;
      this.destInput.value = info.target;
      this.destLabel.textContent = 'Target';
    } else {
      this.urlEl.textContent = info.href;
      this.urlEl.href = info.href;
      this.textInput.value = info.text;
      this.destInput.value = info.href;
      this.destLabel.textContent = 'Link';
    }
    this.tip.style.display = '';
    this.position();
  }

  private resolve(anchor: HTMLAnchorElement): LinkInfo | null {
    if (anchor.getAttribute('data-type') === 'wikilink') {
      const found = wikilinkNodeAt(this.view, anchor);
      if (!found) return null;
      return {
        kind: 'wikilink',
        nodePos: found.pos,
        nodeSize: found.node.nodeSize,
        target: (found.node.attrs.target as string) ?? '',
        alias: (found.node.attrs.alias as string) ?? '',
      };
    }
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return null;
    let pos: number;
    try {
      pos = this.view.posAtDOM(anchor, 0);
    } catch {
      return null;
    }
    const range = linkMarkRangeAt(this.view.state, pos);
    if (!range) return null;
    return { kind: 'markdown', ...range };
  }

  private position() {
    const r = this.anchorRect;
    if (!r) return;
    this.tip.style.visibility = 'hidden';
    this.tip.style.display = '';
    const tipRect = this.tip.getBoundingClientRect();
    const margin = 6;
    let left = Math.min(r.left, window.innerWidth - tipRect.width - margin);
    left = Math.max(margin, left);
    let top = r.bottom + margin;
    if (top + tipRect.height > window.innerHeight - margin) {
      top = r.top - tipRect.height - margin;
    }
    this.tip.style.left = `${Math.round(left)}px`;
    this.tip.style.top = `${Math.round(top)}px`;
    this.tip.style.visibility = '';
  }

  private scheduleHide = () => {
    this.cancelHide();
    this.hideTimer = window.setTimeout(() => this.hide(), HIDE_DELAY);
  };

  private cancelHide = () => {
    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
  };

  private hide() {
    this.tip.style.display = 'none';
    this.form.style.display = 'none';
    this.row.style.display = '';
  }

  private onOpen = (e: MouseEvent) => {
    e.preventDefault();
    const info = this.info;
    if (!info) return;
    if (info.kind === 'wikilink') void openWikilink(info.target, docPath());
    else void openMarkdownLink(info.href, docPath());
    this.hide();
  };

  private onEnterEdit = (e: MouseEvent) => {
    e.preventDefault();
    this.row.style.display = 'none';
    this.form.style.display = '';
    this.position();
    this.destInput.focus();
    this.destInput.select();
  };

  private onFormKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.onSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.hide();
      this.view.focus();
    }
  };

  private onSave = () => {
    const info = this.info;
    if (!info) {
      this.hide();
      return;
    }
    const text = this.textInput.value;
    const dest = this.destInput.value;
    const { state } = this.view;
    if (info.kind === 'wikilink') {
      const node = state.doc.nodeAt(info.nodePos);
      if (node?.type.name === 'wikilink') {
        this.view.dispatch(
          state.tr.setNodeMarkup(info.nodePos, undefined, {
            target: dest,
            alias: text && text !== dest ? text : null,
          }),
        );
      }
    } else {
      this.view.dispatch(buildLinkEdit(state, info.from, info.to, text, dest));
    }
    this.hide();
    this.view.focus();
  };

  private onRemove = (e: MouseEvent) => {
    e.preventDefault();
    const info = this.info;
    if (!info) {
      this.hide();
      return;
    }
    const { state } = this.view;
    if (info.kind === 'wikilink') {
      const node = state.doc.nodeAt(info.nodePos);
      if (node?.type.name === 'wikilink') {
        const display = info.alias || info.target;
        const tr = display
          ? state.tr.replaceWith(info.nodePos, info.nodePos + node.nodeSize, state.schema.text(display))
          : state.tr.delete(info.nodePos, info.nodePos + node.nodeSize);
        this.view.dispatch(tr);
      }
    } else {
      const linkType = state.schema.marks.link;
      if (linkType) this.view.dispatch(state.tr.removeMark(info.from, info.to, linkType));
    }
    this.hide();
    this.view.focus();
  };

  update() {}

  destroy() {
    this.cancelHide();
    this.view.dom.removeEventListener('mouseover', this.onMouseOver);
    this.view.dom.removeEventListener('mouseout', this.onMouseOut);
    this.tip.remove();
  }
}

function iconButton(label: string, svg: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'link-tooltip-btn';
  b.title = label;
  b.setAttribute('aria-label', label);
  b.innerHTML = svg;
  return b;
}

function field(placeholder: string): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.spellcheck = false;
  i.placeholder = placeholder;
  return i;
}

function labelled(label: string, input: HTMLInputElement): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = 'link-tooltip-field';
  const span = document.createElement('span');
  span.textContent = label;
  wrap.append(span, input);
  return wrap;
}

const PENCIL =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M11.5 2.5 13.5 4.5 5.5 12.5 3 13l.5-2.5 8-8Z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>';
const UNLINK =
  '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">' +
  '<path d="M6.5 9.5 9.5 6.5M7 4.5 8.3 3.2a2.4 2.4 0 0 1 3.4 3.4L10.4 7.9M9 11.5 7.7 12.8a2.4 2.4 0 0 1-3.4-3.4L5.6 8.1" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>' +
  '<path d="M2.5 2.5 13.5 13.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>';

/**
 * Follow a link on a plain click. Routes wikilink atom nodes through the vault
 * resolver and `link`-marked text through the markdown link opener. Returns true
 * to consume the click so the cursor doesn't land mid-link.
 */
function followLinkAt(node: PMNode): boolean {
  if (node.type.name === 'wikilink') {
    const target = (node.attrs.target as string) ?? '';
    if (target) void openWikilink(target, docPath());
    return true;
  }
  const linkMark = node.marks?.find((m) => m.type.name === 'link');
  if (linkMark) {
    const href = (linkMark.attrs.href as string) ?? '';
    if (href && href !== '#') void openMarkdownLink(href, docPath());
    return true;
  }
  return false;
}

export const linkTooltip = $prose(
  () =>
    new Plugin({
      props: {
        // WKWebView swallows the `click` event for editable links; handleClickOn
        // is driven by mousedown/mouseup, so it fires on a plain click.
        handleClickOn: (_view, _pos, node) => followLinkAt(node),
      },
      view: (editorView) => new LinkTooltipView(editorView),
    }),
);
