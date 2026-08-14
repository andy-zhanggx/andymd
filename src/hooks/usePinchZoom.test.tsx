// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useRef } from 'react';
import { usePinchZoom } from './usePinchZoom';
import { useUIStore } from '../stores/uiStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const ref = useRef<HTMLElement | null>(null);
  usePinchZoom(ref);
  return <main ref={ref} />;
}

function ctrlWheel(target: EventTarget, deltaY = -100) {
  const e = new WheelEvent('wheel', { deltaY, clientX: 0, clientY: 0, bubbles: true });
  // happy-dom's WheelEvent constructor drops modifier keys from the init dict.
  Object.defineProperty(e, 'ctrlKey', { value: true });
  target.dispatchEvent(e);
}

describe('usePinchZoom wheel listener gating', () => {
  let container: HTMLDivElement;
  let root: Root;

  const mount = () => {
    act(() => {
      root.render(<Probe />);
    });
    return document.querySelector('main')!;
  };

  beforeEach(() => {
    useUIStore.setState({ zoomMode: 'custom', zoomLevel: 1 });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    delete (window as { ongesturestart?: unknown }).ongesturestart;
  });

  it('zooms on ctrl+wheel immediately on engines without native gesture events', () => {
    const main = mount();
    ctrlWheel(main);
    expect(useUIStore.getState().zoomLevel).toBeGreaterThan(1);
  });

  it('attaches the wheel-zoom listener only while Control is held when gesture events exist', () => {
    // Simulate WKWebView, which exposes gesture events for pinches.
    (window as { ongesturestart?: unknown }).ongesturestart = null;
    const main = mount();

    // Without Control held there is no wheel listener — scrolling stays passive.
    ctrlWheel(main);
    expect(useUIStore.getState().zoomLevel).toBe(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }));
    ctrlWheel(main);
    const zoomed = useUIStore.getState().zoomLevel;
    expect(zoomed).toBeGreaterThan(1);

    // Releasing Control detaches the listener again.
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control' }));
    ctrlWheel(main);
    expect(useUIStore.getState().zoomLevel).toBe(zoomed);
  });

  it('drops the wheel-zoom listener when the window blurs mid-hold', () => {
    (window as { ongesturestart?: unknown }).ongesturestart = null;
    const main = mount();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }));
    window.dispatchEvent(new Event('blur'));
    ctrlWheel(main);
    expect(useUIStore.getState().zoomLevel).toBe(1);
  });
});
