import { useEffect, useState } from 'react';

/**
 * Platform detection for the mobile (iOS) port.
 *
 * AndyMD started life as a desktop Tauri app; the iOS build reuses the same web
 * frontend but needs a few behavioural differences (no native menu bar, no
 * in-app updater, a sandbox-rooted default vault, a drawer sidebar instead of a
 * resizable pane). These helpers centralise "are we on iOS?" / "is the viewport
 * narrow?" so components don't sniff `navigator` ad hoc.
 */

/** True when running inside an iOS WKWebView (iPhone/iPad). */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ reports a desktop "Macintosh" UA but is still touch-driven.
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/** True on any touch-first mobile platform we ship (currently just iOS). */
export function isMobile(): boolean {
  return isIOS();
}

/** Default viewport width below which we switch to the mobile/drawer layout. */
export const NARROW_BREAKPOINT_PX = 768;

/**
 * Reactive "is the viewport narrow (phone-sized)?" hook. Drives the responsive
 * layout: a narrow viewport — whether a real iPhone or a small desktop window —
 * collapses the sidebar into an overlay drawer. Falls back to a static read when
 * `matchMedia` is unavailable (e.g. jsdom in unit tests).
 */
export function useIsNarrow(breakpointPx: number = NARROW_BREAKPOINT_PX): boolean {
  const query = `(max-width: ${breakpointPx}px)`;
  const get = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false;

  const [narrow, setNarrow] = useState<boolean>(get);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(query);
    const onChange = () => setNarrow(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return narrow;
}
