# Changelog

All notable changes to AndyMD are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(see [Versioning](README.md#versioning)).

## [Unreleased]

## [0.4.1] — 2026-08-14

### Fixed

- **Smooth scrolling in long documents.** Scrolling a long article no longer
  stutters. The trackpad-zoom handler kept a permanently attached non-passive
  `wheel` listener on the editor scroller, which forced every wheel frame
  through the main thread (WebKit disables asynchronous scrolling in that
  case); it now attaches only while `⌃` is held, so ordinary scrolling stays
  fully asynchronous. The outline's current-heading highlight also measured
  every heading's position on every scroll frame — positions are now cached
  and per-scroll work is pure arithmetic — and the minimap's document clone is
  isolated with CSS containment so it can't amplify layout work.
- **Less blanking (white flashes) while scrolling long documents.** The
  minimap panned its thumbnail by transforming a document-sized
  `will-change: transform` layer, forcing WebKit to revalidate a huge tiled
  layer on every scroll frame — starving the editor's own tile painting. The
  thumbnail now pans via native scrolling of the strip-sized clipped host, so
  painting stays bounded by the strip.

## [0.4.0] — 2026-08-14

### Added

- **Search in Workspace (`⇧⌘F`).** Full-text search across every Markdown and
  text file in the vault, with per-file grouping, highlighted matches, and
  keyboard navigation. Opening a result jumps to the file with all matches
  highlighted (`⌘G` steps through them). Also in Edit → Search in Workspace…
- **Paste images from the clipboard.** Screenshots and images copied from
  other apps paste straight into the document — they're saved into `assets/`
  next to the note (screenshots get a timestamped name). Pastes that also
  carry text (e.g. a spreadsheet range) still paste as text.
- **Backlinks panel.** The status-bar backlinks count is now clickable: it
  lists which notes link here, with the matching lines, and clicking one opens
  that note.
- **Table editing.** Right-click inside any table for Typora-style operations:
  add row above/below, add column left/right, align a column left/center/right,
  delete row/column/table.
- **Footnotes.** GFM footnotes (`[^1]` references and `[^1]: …` definitions)
  render styled in the editor, round-trip losslessly, and carry their styling
  into HTML export.

## [0.3.2] — 2026-08-05

### Added

- **Document minimap.** A VSCode-style thumbnail of the whole document sits
  beside the editor, with a draggable viewport indicator — click or drag it to
  jump anywhere. Toggle it from View → Minimap (`⇧⌘M`) or the status-bar
  button; the setting is remembered across launches. Hidden in Source mode.
- **External file changes are detected and merged.** When a file open in
  AndyMD is modified on disk (git pull, Obsidian, a sync client), the app
  notices immediately: a clean tab reloads from disk, while a tab with unsaved
  edits gets a conflict dialog showing a diff and offering a three-way merge —
  replacing the old dead-end "Save As" alert. If a merge leaves conflict
  markers, the editor drops to Source mode so they're visible and resolvable.

### Fixed

- **Outline now highlights the section you're reading, reliably.** The active
  heading tracks your scroll position correctly at any zoom level (it used to
  drift when the document was zoomed), updates as images and math finish
  loading, and the highlighted entry keeps itself scrolled into view inside
  the outline panel.

## [0.3.1] — 2026-08-04

### Fixed

- **Inline `$…$` math with `\tag{…}` no longer shows a red KaTeX error.**
  KaTeX only allows `\tag` in display mode, so numbered equations wrapped in
  single dollars (common in LLM-exported notes) rendered as raw red source.
  Such formulas are now detected and typeset as display equations — tag
  included — while ordinary inline math stays inline and genuinely invalid
  math keeps the visible error rendering.

## [0.3.0] — 2026-08-03

### Added

- **Zoom & reading modes (Acrobat-style).** Zoom the document to any level from
  25% to 400%: two-finger trackpad pinch (zooms around the pointer), `⇧⌘+` /
  `⇧⌘−` to step through presets, a status-bar zoom control with a preset menu,
  and View-menu items. Two reading modes match Adobe Acrobat: **Fit Width**
  (`⇧⌘2`) keeps the content column filling the window as it resizes, and
  **Actual Size** (`⇧⌘0`) returns to 100%. Works in both Visual and Source
  mode; the zoom level is remembered across launches and never affects
  printing.

## [0.2.0] — 2026-06-18

### Added

- **Multiple tabs.** Open documents side by side in tabs — `⌘T` for a new tab,
  `Ctrl+Tab` to cycle, middle-click or `⌘`-click a file or link to open it in a
  new tab, and an "Open in New Tab / This Window" link context menu. Your open
  tabs are restored on the next launch. (Can be turned off via the `MULTI_TABS`
  flag.)
- **Typora-style editing shortcuts.** The editor now matches Typora's keyboard
  map: headings `⌘1`–`⌘6`, paragraph `⌘0`, increase/decrease heading level
  `⌘=`/`⌘-`; table `⌘⌥T`, quote `⌘⌥Q`, ordered/unordered list `⌘⌥O`/`⌘⌥U`,
  math block `⌘⌥B` (code fences `⌘⌥C` already worked); hyperlink `⌘K`, image
  `⌘⌃I`, underline `⌘U`, inline code `⌘⇧\``, strikethrough `⌃⇧\``, clear format
  `⌘\`; select line `⌘L`, select word `⌘D`, delete word `⌘⇧D`. Copy as Markdown
  is now `⌘⇧C` and Toggle Sidebar moved to `⌘⇧L`, which frees `⌘B` to always be
  bold in the editor. (Select all `⌘A`, undo `⌘Z`, redo `⌘⇧Z`/`⌘Y` and the mark
  shortcuts already worked.)
- **Automatic updates.** AndyMD checks for new versions on launch and offers a
  one-click restart-to-update from the title bar, plus a Software Update settings
  dialog. Updates are fetched from the public GitHub Releases channel.
- **"What's New" popup.** After upgrading, the release notes for the new version
  appear once automatically; reopen them any time from the Help menu.
- **Real-time collaboration (preview).** Edit a document together over a share
  code, with live presence. Off by default — opt in via the `ONLINE_COLLAB` flag.
- **Inline HTML rendering**, plus math and image blocks that expand to an
  editable view in place.
- **Cmd-aware links.** Hold ⌘ to turn links into clickable targets, navigate with
  ⌘-click, and step through a back/forward **jump history**.
- **Directory & relative link resolution.** Markdown `[x](folder/)` and `./`,
  `../` links resolve against the vault; dead links are shown in muted grey-blue.
- **Build label** pill in the title bar so you can tell which build is running.

### Changed

- Releases and in-app updates now run through a **public GitHub Releases**
  channel — per-architecture macOS `.dmg` builds, no access token required.

### Fixed

- Block math now has a clearer expand-to-edit affordance.
- Wikilinks resolve `./` and `../` relative paths correctly.

## [0.1.3] — 2026-06-17

### Added

- Sidebar workspace context menu: right-click the workspace header for
  **New File**, **New Folder**, and **Reveal in Finder** (destructive actions
  are intentionally omitted on the vault root).

### Fixed

- HTML comments (`<!-- … -->`) no longer render as visible literal text. They
  are shown as muted meta-text, and multi-line comments containing emoji/markers
  are kept as a single node instead of being fragmented (which previously leaked
  a stray emoji glyph). Comments round-trip losslessly.
- Emoji now render as inline glyphs sized to the surrounding text instead of
  ballooning to full-size block images.

## [0.1.2] — 2026-06-17

### Changed

- New app icon: black squircle with an `andy.md` wordmark (white `andy`, accent
  `.md`) in Avenir Next. Source is `src-tauri/icons/icon-source.svg`; regenerate
  all sizes with `pnpm tauri icon src-tauri/icons/icon-source.png`.

### Fixed

- macOS build: ad-hoc sign the app bundle (`bundle.macOS.signingIdentity: "-"`)
  so the `.app` has a valid, resource-sealed signature. Without it the bundle's
  signature was invalid (no sealed resources) and macOS refused to launch the
  downloaded app as "damaged". (First launch still needs right-click → Open —
  the app is ad-hoc signed, not notarized.)

## [0.1.1] — 2026-06-17

### Fixed

- Onboarding tour: keep the spotlight and tooltip card inside the viewport.
  A step targeting a near-fullscreen element (the editor pane) drew the
  spotlight ring against the screen edges and pushed the card off-screen; such
  targets now use a centered card over a plain dimmed backdrop, and the ring and
  card are clamped to the viewport.

## [0.1.0] — 2026-06-17

First tagged release. A macOS WYSIWYG Markdown editor in the spirit of Typora,
built with Tauri 2 + React 18 + Milkdown.

### Added

- WYSIWYG Markdown editing: CommonMark + GFM (tables, task lists, strikethrough).
- Code block syntax highlighting (Prism) and KaTeX math (`$inline$`, `$$block$$`).
- Extended marks: `==highlight==`, `^superscript^`, `~subscript~`; Mermaid diagrams; emoji shortcodes.
- Auto-pair brackets/quotes, optional smart punctuation, native spell-check, optional auto-save, per-file version history.
- Workspace sidebar with file tree, document outline (TOC), and a **New File** button.
- New files (⌘N / File → New / sidebar / context menu) are created in the workspace, appear in the sidebar, and open ready to edit.
- Find & Replace (⌘F / ⌘G / ⌘⌥F), Source-code mode (⌘/), Focus mode (F8), Typewriter mode (F9).
- Export to HTML / Word / ePub / LaTeX / RTF (pandoc); Print / Save-as-PDF; Copy as Markdown / HTML.
- Document statistics, Open Recent files & folders, Full Screen, per-file scroll memory.
- Light / dark / system theme; `.md` / `.markdown` Finder file association; external-modification detection on save.
- First-run **onboarding tour** (bilingual EN / 中文) with spotlight steps; replay from the status-bar `?` button or **Help → Welcome Tour**.

[Unreleased]: https://github.com/andy-zhanggx/andymd/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/andy-zhanggx/andymd/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/andy-zhanggx/andymd/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/andy-zhanggx/andymd/compare/v0.1.3...v0.2.0
[0.1.3]: https://github.com/andy-zhanggx/andymd/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/andy-zhanggx/andymd/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/andy-zhanggx/andymd/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/andy-zhanggx/andymd/releases/tag/v0.1.0
