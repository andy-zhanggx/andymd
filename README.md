# AndyMD

macOS WYSIWYG Markdown editor in the spirit of Typora. Built with Tauri 2 + React 18 + Milkdown.

Personal project by Andy Zhang.

## Features (v0.1)

- WYSIWYG Markdown editing: CommonMark + GFM (tables, task lists, strikethrough)
- Code block syntax highlighting (Prism)
- KaTeX math (`$inline$` and `$$block$$`)
- Extended marks: `==highlight==`, `^superscript^`, `~subscript~` (live input rules)
- Mermaid diagrams (` ```mermaid `), emoji shortcodes (`:smile:`)
- Auto-pair brackets & quotes; optional smart punctuation
- Native spell-check, optional auto-save, and per-file version history
- Lenient Chinese-friendly heading parsing (`##标题` without space still renders as H2)
- File tree sidebar **+ document outline (TOC) panel**
- **Find & Replace** (⌘F / ⌘G / ⌘⌥F) with live match highlights
- **Source-code mode** (⌘/), **Focus mode** (F8), **Typewriter mode** (F9)
- **Document statistics** popover (words, chars, lines, reading time)
- **Export** to HTML (⌘⇧E), **Word / ePub / LaTeX / RTF** (pandoc), Print / Save-as-PDF (⌘P)
- **Copy as Markdown / HTML**
- **Open Recent** files & folders; **Full Screen** (F11)
- Per-file scroll memory (reopen a file where you left off)
- macOS native menu, red-dot dirty indicator, ⌘S / ⌘O / ⌘N / ⌘W / ⌘B shortcuts
- Light / dark / system theme
- `.md` / `.markdown` file association (Finder → Open With)
- External-modification detection on save

## Develop

```bash
pnpm install
pnpm tauri dev
```

## Build

```bash
pnpm tauri build          # produces src-tauri/target/release/bundle/{macos,dmg}/
```

## Test

```bash
pnpm test                 # TypeScript / Vitest (115 tests)
cd src-tauri && cargo test  # Rust (10 tests)
```

## Docs

- Design: [`docs/superpowers/specs/2026-04-23-typora-clone-design.md`](docs/superpowers/specs/2026-04-23-typora-clone-design.md) (historical name)
- Implementation plan: [`docs/superpowers/plans/2026-04-23-v0.1-mvp.md`](docs/superpowers/plans/2026-04-23-v0.1-mvp.md)
- Later specs live under [`docs/superpowers/specs/`](docs/superpowers/specs/)

## License

Not open-sourced — private for now.
