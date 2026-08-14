import { useEffect, type RefObject } from 'react';
import { useUIStore } from '../stores/uiStore';
import { clampZoom } from '../lib/zoom';

// WebKit-proprietary trackpad pinch events (fired by WKWebView on macOS).
interface WebKitGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
  preventDefault(): void;
}

/**
 * Two-finger trackpad pinch zoom on the editor scroller.
 *
 * WKWebView delivers pinches as WebKit `gesturestart/change/end` events;
 * Chromium-style engines synthesize `wheel` events with `ctrlKey` set (which
 * also makes ⌃-scroll zoom work with a mouse). Both paths funnel into the same
 * anchor-preserving zoom: the content point under the pointer stays put by
 * compensating the scroll offsets after the new zoom has been laid out.
 */
export function usePinchZoom(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let gestureActive = false;
    let gestureStartZoom = 1;

    const applyZoom = (target: number, cx: number, cy: number) => {
      const ui = useUIStore.getState();
      const cur = ui.effectiveZoom();
      const next = clampZoom(target);
      if (Math.abs(next - cur) < 0.0005) return;
      const rect = el.getBoundingClientRect();
      const ox = cx - rect.left;
      const oy = cy - rect.top;
      const { scrollLeft, scrollTop } = el;
      const ratio = next / cur;
      ui.setZoomLevel(next);
      // The zoom style lands on the next React commit; adjust scroll after it.
      requestAnimationFrame(() => {
        el.scrollLeft = (scrollLeft + ox) * ratio - ox;
        el.scrollTop = (scrollTop + oy) * ratio - oy;
      });
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey || gestureActive) return;
      e.preventDefault();
      const cur = useUIStore.getState().effectiveZoom();
      applyZoom(cur * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
    };

    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureActive = true;
      gestureStartZoom = useUIStore.getState().effectiveZoom();
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      const g = e as WebKitGestureEvent;
      applyZoom(gestureStartZoom * g.scale, g.clientX, g.clientY);
    };
    const onGestureEnd = (e: Event) => {
      e.preventDefault();
      gestureActive = false;
    };

    // A permanently attached non-passive `wheel` listener puts the scroller on
    // WebKit's main-thread scrolling path: every wheel frame must wait for JS +
    // layout/paint of the whole document, which makes long documents visibly
    // janky. WKWebView delivers pinches as gesture events, so there the wheel
    // path only serves ⌃-scroll zoom — attach it non-passively just while ⌃ is
    // held, keeping ordinary scrolling fully asynchronous. Chromium-style
    // engines synthesize pinches as ctrl-wheel with no preceding keydown, so
    // they keep the always-on listener.
    const hasNativeGestures = 'ongesturestart' in window;

    let wheelAttached = false;
    const attachWheel = () => {
      if (wheelAttached) return;
      wheelAttached = true;
      el.addEventListener('wheel', onWheel, { passive: false });
    };
    const detachWheel = () => {
      if (!wheelAttached) return;
      wheelAttached = false;
      el.removeEventListener('wheel', onWheel);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') attachWheel();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') detachWheel();
    };
    const onWindowBlur = () => detachWheel();

    if (hasNativeGestures) {
      window.addEventListener('keydown', onKeyDown, true);
      window.addEventListener('keyup', onKeyUp, true);
      window.addEventListener('blur', onWindowBlur);
    } else {
      attachWheel();
    }
    el.addEventListener('gesturestart', onGestureStart);
    el.addEventListener('gesturechange', onGestureChange);
    el.addEventListener('gestureend', onGestureEnd);
    return () => {
      detachWheel();
      if (hasNativeGestures) {
        window.removeEventListener('keydown', onKeyDown, true);
        window.removeEventListener('keyup', onKeyUp, true);
        window.removeEventListener('blur', onWindowBlur);
      }
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
      el.removeEventListener('gestureend', onGestureEnd);
    };
  }, [ref]);
}
