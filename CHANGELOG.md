# Changelog

All notable changes to AndyMD are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(see [Versioning](README.md#versioning)).

## [Unreleased]

### Changed

- New app icon: black squircle with an `andy.md` wordmark (white `andy`, accent
  `.md`) in Avenir Next. Source is `src-tauri/icons/icon-source.svg`; regenerate
  all sizes with `pnpm tauri icon src-tauri/icons/icon-source.png`.

### Fixed

- macOS build: ad-hoc sign the app bundle (`bundle.macOS.signingIdentity: "-"`)
  so the `.app` has a valid, resource-sealed signature. Without it the bundle's
  signature was invalid (no sealed resources) and macOS refused to launch the
  downloaded app as "damaged". The v0.1.1 `.dmg` asset was re-uploaded with the
  fix. (First launch still needs right-click → Open — the app is ad-hoc signed,
  not notarized.)

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

[Unreleased]: https://github.com/OldBao/andymd/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/OldBao/andymd/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/OldBao/andymd/releases/tag/v0.1.0
