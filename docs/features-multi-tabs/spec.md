# Multi-tab support + link "open in tab / this window"

## Goal

Let AndyMD hold several open documents at once as **in-app tabs** (one Tauri
window, Obsidian/VS Code style), and let a right-click on any editor link choose
**Open in this window** (replace the current tab) or **Open in new tab**.

## Decisions

- **In-app tabs**, single window. Not separate OS windows.
- **Tab bar** is its own row directly below the TitleBar, spanning full width.
- **Restore tabs** on relaunch (saved-file paths only; unsaved drafts are not
  persisted).
- **Plain link click** opens in a **new tab by default**, and this is
  **configurable** (`linkOpenInNewTab`). ⌘/Ctrl-click and middle-click always
  open in a new tab regardless of the setting.

## Architecture

### Data model — `documentStore`

`doc: Document | null` becomes a derived **projection** of the active tab, so
every existing consumer (`MarkdownEditor`, `TitleBar`, `StatusBar`, link
services, shortcuts) keeps reading `s.doc` / `s.history` / `s.historyIndex`
unchanged.

```ts
interface Tab { id: string; doc: Document; history: string[]; historyIndex: number }
interface DocumentState {
  tabs: Tab[];
  activeId: string | null;
  doc: Document | null;      // projection of active tab
  history: string[];         // projection
  historyIndex: number;      // projection
  // existing actions operate on the ACTIVE tab:
  open, back, forward, newFile, newDraft, setDraft, save, saveAs, reload,
  close, closeWithConfirmation,
  // new:
  openInNewTab(path), newTab(), closeTab(id), activateTab(id), moveTab(from,to),
  cycleTab(delta), restoreTabs(paths, activePath),
}
```

Rules:

- **`open(path)` = "this window"**: if the active tab already shows `path`,
  reload it (no history push). Else if another tab shows `path`, activate that
  tab (no duplicates). Else replace the active tab's doc (push history); if there
  is no tab yet, create the first one. Replacing a **dirty** active tab prompts
  save/discard first.
- **`openInNewTab(path)`**: activate an existing tab for `path` if present,
  otherwise create + activate a new tab.
- **`closeTab`/`closeWithConfirmation`**: prompt if the tab is dirty, remove it,
  activate a neighbour; closing the last tab returns to the empty state.
- A module counter generates tab ids.
- Every structural change (open/close/activate/move/new) persists the tab
  session; `setDraft` does **not** (tab identity/order is unchanged).

### Tab bar — `src/components/TabBar.tsx`

Renders `tabs` from the store: filename (or "Untitled"), dirty dot, hover ✕,
active highlight. Click = activate, middle-click / ✕ = close, drag = reorder,
horizontal overflow scrolls, trailing ＋ = `newTab()`. Returns `null` when no
tabs are open (the editor empty-state shows instead). Mounted as a new full-width
grid row in `App.tsx` between TitleBar and the sidebar/editor area.

### Link context menu + click behaviour

- A `contextmenu` listener on the editor root detects an `<a>` (wikilink via
  `data-type="wikilink"` → `data-target`, else `href`) and opens
  `LinkContextMenu` (mirrors the Sidebar `ContextMenu` visuals): **Open in this
  window**, **Open in new tab**, ─, **Copy link**.
- `openMarkdownLink` / `openWikilink` take `{ newTab?: boolean }` and route to
  `openInNewTab` vs `open` for markdown/wiki targets (external/OS targets ignore
  the flag).
- Editor link click handler: ⌘/Ctrl-click and middle-click (`auxclick`) force a
  new tab; plain click follows `config.linkOpenInNewTab`.
- Sidebar file context menu gains **Open in new tab**; ⌘/middle-click on a file
  row opens it in a new tab.

### Config & persistence — `AppConfig`

Add `linkOpenInNewTab: boolean` (default **true**), `openTabs: string[]`,
`activeTabPath: string | null`. `documentStore` persists `openTabs`/
`activeTabPath` via `configStore.update`. `main.tsx` bootstrap calls
`restoreTabs(config.openTabs, config.activeTabPath)` after config load.

### Keyboard + native menu

- ⌘T → `newTab`; ⌘W → close active tab (existing `closeWithConfirmation`);
  Ctrl+Tab / Ctrl+Shift+Tab → `cycleTab(±1)`.
- `menu.rs`: add **New Tab** (`new-tab`, CmdOrCtrl+T) and **Open Links in New
  Tab** (`links-new-tab-toggle`) items; handle both in `handleMenuAction`.

## Feature gate

The whole experience is **off by default**, behind the `MULTI_TABS` flag
(`src/featureFlags.ts`, env `VITE_ENABLE_TABS`). With it off the editor is the
prior single-document workspace: no tab strip, links open in place, no tab
shortcuts/menus, and the tab session is not persisted. The native menu items are
gated separately at Rust compile time via `option_env!("ANDYMD_ENABLE_TABS")`, so
a normal release never shows them. Enable both for development:

```bash
VITE_ENABLE_TABS=true ANDYMD_ENABLE_TABS=1 pnpm tauri dev
```

## Layout (Obsidian-style)

The tab strip sits **only over the editor column**, to the right of the sidebar,
which spans the full height beneath the title bar. Grid areas when tabs are on:
`titlebar` (full width) / `sidebar` + `tabbar` / `sidebar` + `editor` /
`statusbar`. The sidebar remains hideable (⌘B); when hidden the strip spans the
single column.

## Out of scope

Separate OS windows; persisting unsaved/dirty buffers across restart; split
panes.

## Testing

`tsc -b` + `pnpm test` (extend `documentStore.test.ts` for tab open/close/dedup
and that history still accumulates on a single tab). Debug `.app` smoke test:
open multiple files in tabs, switch/close/reorder, right-click a link → both
options, relaunch restores tabs.
