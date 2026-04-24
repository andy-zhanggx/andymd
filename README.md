# AndyMD

macOS WYSIWYG Markdown editor in the spirit of Typora. Built with Tauri 2 + React 18 + Milkdown.

Personal project by Andy Zhang.

## Features (v0.1)

- WYSIWYG Markdown editing: CommonMark + GFM (tables, task lists, strikethrough)
- Code block syntax highlighting (Prism)
- KaTeX math (`$inline$` and `$$block$$`)
- Lenient Chinese-friendly heading parsing (`##标题` without space still renders as H2)
- File tree sidebar, open single files or whole workspace folders
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
pnpm test                 # TypeScript / Vitest (29 tests)
cd src-tauri && cargo test  # Rust (10 tests)
```

## Docs

- Design: [`docs/superpowers/specs/2026-04-23-typora-clone-design.md`](docs/superpowers/specs/2026-04-23-typora-clone-design.md) (historical name)
- Implementation plan: [`docs/superpowers/plans/2026-04-23-v0.1-mvp.md`](docs/superpowers/plans/2026-04-23-v0.1-mvp.md)
- Later specs live under [`docs/superpowers/specs/`](docs/superpowers/specs/)

## License

Not open-sourced — private for now.
