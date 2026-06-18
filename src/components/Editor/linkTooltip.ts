import { $prose } from '@milkdown/utils';
import { Plugin } from '@milkdown/prose/state';
import type { EditorState, Transaction } from '@milkdown/prose/state';
import type { EditorView } from '@milkdown/prose/view';
import { openMarkdownLink } from '../../services/linkService';
import { useDocumentStore } from '../../stores/documentStore';

/**
 * Hover tooltip for markdown links (the `link` mark, not wikilinks).
 *
 * Markdown links follow on a plain click (see MarkdownEditor's clickHandler), so
 * there is no way to click *into* one to change it. This tooltip fills that gap,
 * Typora/Obsidian-style: hovering a link pops a small card showing its URL with
 * Open / Edit / Remove actions. "Edit" reveals two fields — the link **text**
 * and the **URL** — so both can be changed (previously only the visible text was
 * editable by retyping). Committing rewrites the link in place.
 */

/** The doc range a link mark spans around `pos`, plus its href, or null. */
export function linkMarkRangeAt(
  state: EditorState,
  pos: number,
): { from: number; to: number; href: string; text: string } | null {
  const linkType = state.schema.marks.link;
  if (!linkType) return null;
  const $pos = state.doc.resolve(pos);
  // The mark may sit on the node just before or just after the position.
  const mark =
    linkType.isInSet($pos.marks()) ||
    (($pos.nodeAfter && linkType.isInSet($pos.nodeAfter.marks)) || null) ||
    (($pos.nodeBefore && linkType.isInSet($pos.nodeBefore.marks)) || null);
  if (!mark) return null;

  const parent = $pos.parent;
  const parentStart = $pos.start();
  // Walk the parent's inline children to find the contiguous run carrying this
  // exact mark (same href) that contains pos.
  let from = -1;
  let to = -1;
  let offset = 0;
  parent.forEach((child) => {
    const childFrom = parentStart + offset;
    const childTo = childFrom + child.nodeSize;
    if (mark.isInSet(child.marks)) {
      if (from === -1) from = childFrom;
      to = childTo;
    } else if (from !== -1 && childFrom > pos) {
      // run already started and we've moved past pos into a non-link child
    } else if (from !== -1) {
      // a gap before reaching pos resets the run
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

const HIDE_DELAY = 160;

class LinkTooltipView {
  private tip: HTMLElement;
  private urlEl: HTMLAnchorElement;
  private form: HTMLElement;
  private textInput: HTMLInputElement;
  private hrefInput: HTMLInputElement;
  private hideTimer: number | null = null;
  private anchorRect: DOMRect | null = null;
  private range: { from: number; to: number } | null = null;

  constructor(private view: EditorView) {
    const tip = document.createElement('div');
    tip.className = 'link-tooltip';
    tip.setAttribute('contenteditable', 'false');
    tip.style.display = 'none';

    // --- display row: URL + actions ---
    const row = document.createElement('div');
    row.className = 'link-tooltip-row';
    const url = document.createElement('a');
    url.className = 'link-tooltip-url';
    url.target = '_blank';
    url.rel = 'noreferrer';
    const editBtn = iconButton('Edit link', PENCIL);
    const removeBtn = iconButton('Remove link', UNLINK);
    row.append(url, editBtn, removeBtn);

    // --- edit form: text + href ---
    const form = document.createElement('div');
    form.className = 'link-tooltip-form';
    form.style.display = 'none';
    const textInput = field('Text');
    const hrefInput = field('https://');
    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'link-tooltip-save';
    saveBtn.textContent = 'Save';
    form.append(labelled('Text', textInput), labelled('Link', hrefInput), saveBtn);

    tip.append(row, form);
    document.body.appendChild(tip);

    this.tip = tip;
    this.urlEl = url;
    this.form = form;
    this.textInput = textInput;
    this.hrefInput = hrefInput;

    // Keep open while pointer is over the tooltip; close shortly after it leaves.
    tip.addEventListener('mouseenter', this.cancelHide);
    tip.addEventListener('mouseleave', this.scheduleHide);
    url.addEventListener('click', this.onOpen);
    editBtn.addEventListener('click', this.onEnterEdit);
    removeBtn.addEventListener('click', this.onRemove);
    saveBtn.addEventListener('click', this.onSave);
    this.hrefInput.addEventListener('keydown', this.onFormKey);
    this.textInput.addEventListener('keydown', this.onFormKey);

    view.dom.addEventListener('mouseover', this.onMouseOver);
    view.dom.addEventListener('mouseout', this.onMouseOut);
  }

  private onMouseOver = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.('a');
    if (!anchor || !this.view.dom.contains(anchor)) return;
    // Wikilinks have their own behaviour and no editable href.
    if (anchor.getAttribute('data-type') === 'wikilink') return;
    const href = anchor.getAttribute('href');
    if (!href || href === '#') return;
    this.cancelHide();
    this.showFor(anchor as HTMLAnchorElement, href);
  };

  private onMouseOut = (e: MouseEvent) => {
    const to = e.relatedTarget as Node | null;
    if (to && (this.tip.contains(to) || this.view.dom.contains(to))) {
      // Moving within the editor; only hide if we left the link entirely.
      const stillOnLink = to instanceof HTMLElement && to.closest('a');
      if (stillOnLink) return;
    }
    this.scheduleHide();
  };

  private showFor(anchor: HTMLAnchorElement, href: string) {
    if (this.form.style.display !== 'none') return; // don't disrupt an open edit
    const pos = this.view.posAtDOM(anchor, 0);
    const range = linkMarkRangeAt(this.view.state, pos);
    this.range = range ? { from: range.from, to: range.to } : null;
    this.anchorRect = anchor.getBoundingClientRect();
    this.urlEl.textContent = href;
    this.urlEl.href = href;
    this.textInput.value = range?.text ?? anchor.textContent ?? '';
    this.hrefInput.value = href;
    this.tip.style.display = '';
    this.position();
  }

  private position() {
    const r = this.anchorRect;
    if (!r) return;
    this.tip.style.visibility = 'hidden';
    this.tip.style.display = '';
    const tipRect = this.tip.getBoundingClientRect();
    const margin = 6;
    let left = r.left;
    left = Math.min(left, window.innerWidth - tipRect.width - margin);
    left = Math.max(margin, left);
    let top = r.bottom + margin;
    if (top + tipRect.height > window.innerHeight - margin) {
      top = r.top - tipRect.height - margin; // flip above when no room below
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
    this.tip.querySelector('.link-tooltip-row')!.removeAttribute('style');
  }

  private onOpen = (e: MouseEvent) => {
    e.preventDefault();
    const href = this.hrefInput.value || this.urlEl.href;
    void openMarkdownLink(href, useDocumentStore.getState().doc?.path ?? null);
    this.hide();
  };

  private onEnterEdit = (e: MouseEvent) => {
    e.preventDefault();
    (this.tip.querySelector('.link-tooltip-row') as HTMLElement).style.display = 'none';
    this.form.style.display = '';
    this.position();
    this.hrefInput.focus();
    this.hrefInput.select();
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
    if (!this.range) {
      this.hide();
      return;
    }
    const { from, to } = this.range;
    const text = this.textInput.value;
    const href = this.hrefInput.value;
    const tr = buildLinkEdit(this.view.state, from, to, text, href);
    this.view.dispatch(tr);
    this.hide();
    this.view.focus();
  };

  private onRemove = (e: MouseEvent) => {
    e.preventDefault();
    if (!this.range) {
      this.hide();
      return;
    }
    const { from, to } = this.range;
    const linkType = this.view.state.schema.marks.link;
    if (linkType) this.view.dispatch(this.view.state.tr.removeMark(from, to, linkType));
    this.hide();
    this.view.focus();
  };

  update() {
    // Reposition if open and the layout shifted (e.g. scroll handled by fixed).
  }

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

export const linkTooltip = $prose(
  () =>
    new Plugin({
      view: (editorView) => new LinkTooltipView(editorView),
    }),
);
