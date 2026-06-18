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
pnpm tauri build          # current arch → src-tauri/target/release/bundle/{macos,dmg}/

# Per-architecture (Apple Silicon + Intel) — what releases ship. Needs both
# Rust targets (x86_64 cross-compiles fine on Apple Silicon):
rustup target add aarch64-apple-darwin x86_64-apple-darwin   # one-time
pnpm release:macos
#   → src-tauri/target/aarch64-apple-darwin/release/bundle/{macos,dmg}/  (AndyMD_<ver>_aarch64.dmg)
#   → src-tauri/target/x86_64-apple-darwin/release/bundle/{macos,dmg}/   (AndyMD_<ver>_x64.dmg)
```

## Test

```bash
pnpm test                 # TypeScript / Vitest
cd src-tauri && cargo test  # Rust
```

## Versioning

AndyMD follows [Semantic Versioning](https://semver.org/) (`MAJOR.MINOR.PATCH`):

- **MAJOR** — incompatible changes (e.g. config/file format breaks).
- **MINOR** — new features, backwards-compatible.
- **PATCH** — bug fixes only.

Pre-1.0, breaking changes may land in MINOR bumps. The version lives in **three**
files that must stay in sync (Tauri refuses to build otherwise): `package.json`,
`src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`. Don't edit them by hand —
use the bump script:

```bash
pnpm version:set 0.2.0    # updates all three files at once
```

All changes are recorded in [`CHANGELOG.md`](CHANGELOG.md) (Keep a Changelog format).

## Branching

Trunk-based, with short-lived branches:

- **`main`** — always releasable; the source of every tagged release. Never commit
  half-done work here.
- **`feature/<slug>`** — new features (e.g. `feature/outline-panel`).
- **`fix/<slug>`** — bug fixes (e.g. `fix/window-drag`).

Branch off `main`, open a PR, and merge back into `main` once tests pass. Keep
branches focused and short-lived.

## Releasing

1. Ensure `main` is green: `pnpm test` and `cd src-tauri && cargo test`.
2. Bump the version: `pnpm version:set <x.y.z>`.
3. Move the `CHANGELOG.md` `[Unreleased]` notes into a new dated version section.
4. Commit (`release: vX.Y.Z`) and tag, then push to GitLab (runs tests) and
   GitHub (the release host):
   ```bash
   git commit -am "release: vX.Y.Z"
   git tag -a vX.Y.Z -m "AndyMD vX.Y.Z"
   git push && git push --tags          # GitLab origin: runs the Vitest/typecheck gate
   git push github main --tags          # GitHub: triggers the macOS build + release
   ```
5. **Publish the macOS installers + updater manifest.** Two ways:
   - **CI (recommended):** pushing the tag to GitHub triggers
     [`.github/workflows/release-macos.yml`](.github/workflows/release-macos.yml),
     which builds both arches on a hosted macOS runner and publishes them — no
     local build needed.
   - **Locally**, if you prefer:
     ```bash
     TAURI_SIGNING_PRIVATE_KEY="$(cat andymd-updater.key)" \
     TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
       pnpm release:macos     # builds aarch64 + x64 (.dmg + signed updater tarball each)
     pnpm release:dmg         # attach both .dmg to the GitHub release
     pnpm release:update      # publish per-arch updater manifest (latest.json)
     ```

Releases live on **public GitHub Releases** (`andy-zhanggx/andymd`), one
download **per architecture**: `AndyMD_<ver>_aarch64.dmg` (Apple Silicon) and
`AndyMD_<ver>_x64.dmg` (Intel). [`scripts/release-dmg.mjs`](scripts/release-dmg.mjs)
attaches both installers; [`scripts/release-update.mjs`](scripts/release-update.mjs)
publishes `latest.json` mapping `darwin-aarch64` / `darwin-x86_64` each to their
**own** signed tarball, so the in-app updater (anonymous, no token) downloads only
the arch each Mac needs. The bundles are ad-hoc signed, so first launch needs
right-click → Open. (GitLab CI still runs the test gate on every push/MR.)

## Docs

- Design: [`docs/superpowers/specs/2026-04-23-typora-clone-design.md`](docs/superpowers/specs/2026-04-23-typora-clone-design.md) (historical name)
- Implementation plan: [`docs/superpowers/plans/2026-04-23-v0.1-mvp.md`](docs/superpowers/plans/2026-04-23-v0.1-mvp.md)
- Later specs live under [`docs/superpowers/specs/`](docs/superpowers/specs/)

## License

Not open-sourced — private for now.
