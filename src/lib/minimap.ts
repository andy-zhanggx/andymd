/**
 * Pure geometry for the editor minimap (thumbnail strip).
 *
 * The thumbnail is a scaled-down clone of the rendered document; `scaledHeight`
 * is its full height in strip pixels. The scroller's metrics are in real
 * (possibly CSS-zoomed) pixels — all mapping is fraction-based, so the zoom
 * factor and clone scale never need to agree.
 */

export interface MinimapMetrics {
  scrollTop: number;
  scrollHeight: number; // scroller's total content height
  clientHeight: number; // scroller's visible height
  scaledHeight: number; // thumbnail content height, in strip px
  stripHeight: number; // visible strip height
}

export interface MinimapLayout {
  /** Upward pan of the thumbnail within the strip (VSCode-style proportional). */
  offset: number;
  /** Viewport indicator top, relative to the strip. */
  viewportTop: number;
  viewportHeight: number;
  /** Max viewportTop; the linear range a drag moves the indicator across. */
  dragRange: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function minimapLayout(m: MinimapMetrics): MinimapLayout {
  const { scrollTop, scrollHeight, clientHeight, scaledHeight, stripHeight } = m;
  const scrollRange = Math.max(0, scrollHeight - clientHeight);
  const f = scrollRange > 0 ? clamp(scrollTop / scrollRange, 0, 1) : 0;
  const viewportHeight =
    scaledHeight * (scrollHeight > 0 ? clamp(clientHeight / scrollHeight, 0, 1) : 1);
  const pan = Math.max(0, scaledHeight - stripHeight);
  const dragRange = Math.max(0, scaledHeight - viewportHeight - pan);
  return {
    offset: f * pan,
    viewportTop: f * dragRange,
    viewportHeight,
    dragRange,
  };
}

/** The scrollTop that places the viewport indicator's top edge at `stripY`. */
export function scrollTopForStripY(m: MinimapMetrics, stripY: number): number {
  const scrollRange = Math.max(0, m.scrollHeight - m.clientHeight);
  const { dragRange } = minimapLayout(m);
  if (dragRange <= 0) return 0;
  return clamp(stripY / dragRange, 0, 1) * scrollRange;
}
