# Zoom & Reading Modes (Acrobat-aligned)

## Goal

Give AndyMD the reading ergonomics of a PDF reader (Adobe Acrobat):

1. **Reading modes** — *Actual Size* and *Fit Width*, plus *Zoom to N%* presets.
2. **Trackpad pinch zoom** — two-finger pinch on a MacBook continuously zooms
   the document to any percentage.

## Model

- `zoomLevel: number` — multiplier, `1` = 100%. Clamped to **25%–400%**.
- `zoomMode: 'custom' | 'fit-width'`:
  - `custom` — the document renders at exactly `zoomLevel`.
  - `fit-width` — Acrobat's Fit Width: the effective zoom is computed so the
    content column exactly fills the editor pane's width, and it re-computes on
    window/sidebar resize. When `editorWidth` is `full` (fluid column) the
    effective zoom is 1.
- Any explicit zoom action (pinch, ⌘+/⌘−, preset) leaves `fit-width` and enters
  `custom`, **starting from the current effective zoom** (Acrobat behavior).
- Live state lives in `uiStore` (fast, no IO). `zoomMode`/`zoomLevel` are
  persisted to `AppConfig` with a debounced save and restored on launch.

## Rendering

CSS `zoom` on the editor container (`.editor-container`) and on the source-mode
textarea. Unlike `transform: scale`, `zoom` reflows layout, so scrolling,
selection, and the scroller's scrollHeight stay correct in WKWebView. Print
resets zoom to 1 (`print.css`).

Fit-width effective zoom = `scroller.clientWidth / columnWidth(editorWidth)`,
observed via `ResizeObserver` on the `<main>` scroller.

## Input surfaces

| Surface | Behavior |
|---|---|
| Trackpad pinch | WebKit `gesturestart/change/end` (primary in WKWebView) and `wheel` with `ctrlKey` (Chromium-style fallback; also enables ⌃-scroll zoom). Multiplicative, clamped, anchor-preserving: the content point under the cursor stays put by adjusting `scrollTop/Left`. `preventDefault` to suppress any native page magnification. |
| Keyboard | ⇧⌘+ zoom in, ⇧⌘− zoom out (preset ladder); ⇧⌘0 → Actual Size; ⇧⌘2 → Fit Width. The zoom layer is ⇧⌘ because the editor's Typora keymap owns the unshifted ⌘0–⌘6/⌘=/⌘− (paragraph, headings, heading level). Matched on `e.code` (physical keys) in `useShortcuts` keydown so ⇧-modified characters and non-US layouts don't matter; menu accelerators don't preempt the webview. |
| View menu | Zoom In / Zoom Out / Actual Size / Fit Width items (menu.rs) → `menu` events → `handleMenuAction`. |
| Status bar | Left slot: `Fit ▾` / `125% ▾` control; popover offers Fit Width, Actual Size, and the preset ladder 50–400%. |

Preset ladder (⌘+/⌘− steps and popover entries):
`25, 33, 50, 67, 75, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400` (%).

## Files

- `src/lib/zoom.ts` — constants, clamp, ladder stepping, fit-width math.
- `src/stores/uiStore.ts` — `zoomMode`, `zoomLevel`, `fitWidthZoom` (measured),
  actions `setZoomLevel / zoomIn / zoomOut / setFitWidth / actualSize`;
  debounced config persistence + hydration from config load.
- `src/types.ts` — `AppConfig.zoomMode/zoomLevel` + defaults.
- `src/hooks/usePinchZoom.ts` — gesture/wheel listeners on the `<main>` scroller.
- `src/App.tsx` — wire pinch hook + fit-width ResizeObserver to the scroller.
- `src/components/Editor/MarkdownEditor.tsx` — apply `zoom` style (rich + source).
- `src/components/StatusBar.tsx` — zoom control.
- `src/hooks/useShortcuts.ts`, `src-tauri/src/menu.rs` — shortcuts + menu.

## Testing

Vitest: zoom lib (clamp/ladder/fit-width math), uiStore actions
(mode transitions, custom-from-effective on leaving fit-width), StatusBar
control rendering. Manual: debug `.app` against the andykb vault — pinch,
shortcuts, menu, fit-width under sidebar resize.
