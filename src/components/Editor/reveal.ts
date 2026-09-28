import { getActiveView } from './activeView';

/** Normalise heading text for matching: trimmed, collapsed spaces, lowercase. */
function norm(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * After a note opens, scroll the (possibly rebuilt) editor to `heading`.
 * The view is re-created asynchronously when the document changes, so poll
 * briefly for the new one (`prevView` is the view before navigation).
 * Matching is whitespace- and case-insensitive, like Obsidian's `#Heading`.
 */
export function revealHeading(heading: string, prevView: unknown): void {
  if (!heading) return;
  const want = norm(heading);
  const deadline = Date.now() + 2000;
  const tick = () => {
    const view = getActiveView();
    if (view && (view !== prevView || Date.now() > deadline - 1500)) {
      const els = Array.from(view.dom.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6'));
      const el = els.find((h) => norm(h.textContent ?? '') === want);
      el?.scrollIntoView({ block: 'start' });
      return;
    }
    if (Date.now() < deadline) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
