# Changelog

All notable changes to AndyMD are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(see [Versioning](README.md#versioning)).

## [Unreleased]

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

[Unreleased]: https://github.com/andy-zhanggx/andymd/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/andy-zhanggx/andymd/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/andy-zhanggx/andymd/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/andy-zhanggx/andymd/releases/tag/v0.1.0
