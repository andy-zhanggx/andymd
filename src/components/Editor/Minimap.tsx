import { useCallback, useEffect, useRef } from 'react';
import { useDocumentStore } from '../../stores/documentStore';
import { useConfigStore } from '../../stores/configStore';
import { useUIStore } from '../../stores/uiStore';
import { minimapLayout, scrollTopForStripY, MinimapMetrics } from '../../lib/minimap';

export const MINIMAP_WIDTH = 96;
const REBUILD_DEBOUNCE_MS = 300;

/**
 * VSCode-style document thumbnail: a scaled-down clone of the rendered editor
 * in a strip beside the scroller, with a draggable viewport indicator. The
 * clone is rebuilt (debounced) when the document changes; scrolling only moves
 * the indicator/pan via direct style writes, so it stays 60fps cheap.
 */
export function Minimap({ scrollerRef }: { scrollerRef: React.RefObject<HTMLElement | null> }) {
  // Gate in a wrapper so the strip (and all its listeners) mounts fresh
  // whenever it becomes visible again.
  const hasDoc = useDocumentStore((s) => s.doc !== null);
  const sourceMode = useUIStore((s) => s.sourceMode);
  if (!hasDoc || sourceMode) return null;
  return <MinimapStrip scrollerRef={scrollerRef} />;
}

function MinimapStrip({ scrollerRef }: { scrollerRef: React.RefObject<HTMLElement | null> }) {
  const draft = useDocumentStore((s) => s.doc?.draft ?? '');
  const path = useDocumentStore((s) => s.doc?.path ?? null);
  const { editorWidth, fontSize, fontFamily, lineHeight } = useConfigStore((s) => s.config);

  const stripRef = useRef<HTMLDivElement>(null);
  const panRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const scaledHeightRef = useRef(0);
  const rafRef = useRef(0);
  const cloneObsRef = useRef<ResizeObserver | null>(null);
  const srcObsRef = useRef<ResizeObserver | null>(null);
  const cloneWidthRef = useRef(0);
  const timerRef = useRef(0);

  const metrics = useCallback((): MinimapMetrics | null => {
    const scroller = scrollerRef.current;
    const strip = stripRef.current;
    if (!scroller || !strip) return null;
    return {
      scrollTop: scroller.scrollTop,
      scrollHeight: scroller.scrollHeight,
      clientHeight: scroller.clientHeight,
      scaledHeight: scaledHeightRef.current,
      stripHeight: strip.clientHeight,
    };
  }, [scrollerRef]);

  const syncViewport = useCallback(() => {
    rafRef.current = 0;
    const m = metrics();
    const pan = panRef.current;
    const vp = viewportRef.current;
    if (!m || !pan || !vp) return;
    const layout = minimapLayout(m);
    pan.style.transform = `translateY(${-layout.offset}px)`;
    vp.style.top = `${layout.viewportTop}px`;
    vp.style.height = `${Math.max(12, layout.viewportHeight)}px`;
    vp.style.display = m.scaledHeight > 0 ? '' : 'none';
  }, [metrics]);

  const schedule = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(syncViewport);
  }, [syncViewport]);

  // Rebuild the thumbnail from the live editor DOM.
  const rebuild = useCallback(() => {
    const host = scaleRef.current;
    const scroller = scrollerRef.current;
    if (!host || !scroller) return;
    cloneObsRef.current?.disconnect();
    srcObsRef.current?.disconnect();
    const container = scroller.querySelector<HTMLElement>('.editor-container');
    if (container) {
      // Re-clone when the source's width settles or changes (initial layout,
      // sidebar drags, editor-width switches) — the guard breaks the
      // rebuild → observe → rebuild cycle.
      const srcObs = new ResizeObserver(() => {
        if (Math.abs(container.offsetWidth - cloneWidthRef.current) > 1) {
          window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => rebuildRef.current(), REBUILD_DEBOUNCE_MS);
        }
      });
      srcObs.observe(container);
      srcObsRef.current = srcObs;
    }
    // Not mounted or not laid out yet — the observers above will call us back.
    if (!container || container.offsetWidth < 50) {
      host.replaceChildren();
      scaledHeightRef.current = 0;
      cloneWidthRef.current = container?.offsetWidth ?? 0;
      schedule();
      return;
    }
    const clone = container.cloneNode(true) as HTMLElement;
    // Neutralize the source's layout overrides: render the clone unzoomed at a
    // fixed width and let the strip's transform do all the shrinking.
    clone.style.zoom = '1';
    clone.style.margin = '0';
    clone.style.maxWidth = 'none';
    clone.style.display = '';
    clone.querySelectorAll('[contenteditable]').forEach((el) =>
      el.setAttribute('contenteditable', 'false')
    );
    // Strip ids so anchors/getElementById never resolve into the thumbnail.
    if (clone.id) clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    const width = container.offsetWidth;
    cloneWidthRef.current = width;
    const scale = MINIMAP_WIDTH / width;
    clone.style.width = `${width}px`;
    host.style.transform = `scale(${scale})`;
    host.replaceChildren(clone);
    // Track the clone's height as it settles (fonts/images load in the clone
    // too), keeping the viewport math in sync without polling.
    const obs = new ResizeObserver(() => {
      scaledHeightRef.current = clone.offsetHeight * scale;
      schedule();
    });
    obs.observe(clone);
    cloneObsRef.current = obs;
    scaledHeightRef.current = clone.offsetHeight * scale;
    schedule();
  }, [schedule, scrollerRef]);
  // Observers reach rebuild through a ref so their callbacks never go stale.
  const rebuildRef = useRef(rebuild);
  rebuildRef.current = rebuild;

  // Follow the scroller: indicator on scroll, geometry on strip resize.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const strip = stripRef.current;
    if (!scroller || !strip) return;
    scroller.addEventListener('scroll', schedule, { passive: true });
    const ro = new ResizeObserver(schedule);
    ro.observe(strip);
    return () => {
      scroller.removeEventListener('scroll', schedule);
      ro.disconnect();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0; // a stale id here would block every later schedule()
      }
    };
  }, [schedule, scrollerRef]);

  // Rebuild when the document or its rendered look changes. The editor builds
  // asynchronously after a doc switch, so also watch the scroller's DOM for the
  // (re)mounted editor — both funnel into one debounced rebuild.
  useEffect(() => {
    const debounced = () => {
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => rebuildRef.current(), REBUILD_DEBOUNCE_MS);
    };
    debounced();
    const scroller = scrollerRef.current;
    const mo = scroller ? new MutationObserver(debounced) : null;
    if (scroller && mo) mo.observe(scroller, { subtree: true, childList: true });
    return () => {
      window.clearTimeout(timerRef.current);
      mo?.disconnect();
    };
  }, [scrollerRef, draft, path, editorWidth, fontSize, fontFamily, lineHeight]);

  // Tear down the observers with the component.
  useEffect(
    () => () => {
      cloneObsRef.current?.disconnect();
      srcObsRef.current?.disconnect();
    },
    []
  );

  const onPointerDown = (e: React.PointerEvent) => {
    const m = metrics();
    const strip = stripRef.current;
    const scroller = scrollerRef.current;
    if (!m || !strip || !scroller || m.scaledHeight <= 0) return;
    e.preventDefault();
    const stripTop = strip.getBoundingClientRect().top;
    const layout = minimapLayout(m);
    const y = e.clientY - stripTop;
    let grab: number;
    if (y >= layout.viewportTop && y <= layout.viewportTop + layout.viewportHeight) {
      grab = y - layout.viewportTop; // drag: keep the grab point under the cursor
    } else {
      grab = layout.viewportHeight / 2; // jump: center the viewport on the click
      scroller.scrollTop = scrollTopForStripY(m, y - grab);
    }
    const move = (ev: PointerEvent) => {
      const m2 = metrics();
      if (!m2) return;
      scroller.scrollTop = scrollTopForStripY(m2, ev.clientY - stripTop - grab);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={stripRef}
      className="minimap"
      style={{ width: MINIMAP_WIDTH }}
      aria-hidden="true"
      onPointerDown={onPointerDown}
      onWheel={(e) => {
        if (scrollerRef.current) scrollerRef.current.scrollTop += e.deltaY;
      }}
    >
      <div ref={panRef} className="minimap-pan">
        <div ref={scaleRef} className="minimap-scale" />
      </div>
      <div ref={viewportRef} className="minimap-viewport" />
    </div>
  );
}
