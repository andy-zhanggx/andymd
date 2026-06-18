# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Overview

**AndyMD** (`andymd`) — a Tauri (Rust) + React + Milkdown desktop Markdown editor,
tuned for Obsidian-style vaults (wikilinks, fenced math, inline HTML, directory
links). Frontend lives in `src/`, the native shell in `src-tauri/`.

## Key commands

- `pnpm dev` — Vite dev server only (web preview).
- `pnpm tauri dev` — full desktop app with hot reload. ⚠️ Currently fails to
  **cold-start** from a fresh worktree (see "Running from a worktree" below).
- `pnpm build` — `tsc && vite build` (production frontend bundle).
- `pnpm tauri build` — build the desktop app. Add `--debug --bundles app` for a
  quick unsigned `.app` to try locally.
- `pnpm test` — Vitest. Typecheck with **`tsc -b`** (root tsconfig has `files: []`,
  so plain `tsc --noEmit` checks nothing).

## Build labels — know which build you're running

Every build bakes in a short **build label**, shown as a muted pill in the title
bar, so you can tell at a glance which of many feature builds is in front of you.
The value is injected by `vite.config.ts` (`define: __BUILD_LABEL__`) and read via
[`src/buildInfo.ts`](src/buildInfo.ts) → rendered in [`src/components/TitleBar.tsx`](src/components/TitleBar.tsx).

Resolution order (first match wins):

1. **`VITE_RELEASE_NAME`** — the formal release name. **Set this for any release
   build.** Releases are built locally (no macOS CI runner), so pass it explicitly:
   ```bash
   VITE_RELEASE_NAME="v$(node -p "require('./package.json').version")" pnpm tauri build
   # then: pnpm release:dmg
   ```
2. If running under CI (`CI` / `GITHUB_ACTIONS` / `GITLAB_CI`) with no release name
   → label is empty (never leak a branch name into a release).
3. **`VITE_FEATURE_NAME`** — manual local override, e.g. `VITE_FEATURE_NAME="cmd-jump" pnpm tauri dev`.
4. **Local default** → the current **git branch** name.

So: **local/feature builds show the branch (or `VITE_FEATURE_NAME`); release builds
show `VITE_RELEASE_NAME`.** When adding new release tooling, keep setting
`VITE_RELEASE_NAME` so the formal name — not a branch — ends up in shipped builds.

## Running from a worktree

A fresh git worktree has an empty `node_modules`; run `pnpm install` in it first.
`pnpm tauri dev` cannot cold-start here (`vite.config.ts` lists `@milkdown/kit` and
bare `y-protocols`, which has no `.` export, in `optimizeDeps.include`). To try the
app, build a debug bundle instead — `optimizeDeps` is dev-only:

```bash
pnpm install
pnpm tauri build --debug --bundles app
open src-tauri/target/debug/bundle/macos/AndyMD.app
```

The build exits non-zero at the very end on `A public key has been found, but no
private key` — that's the auto-updater signing step (release-only); the `.app` is
already fully bundled and runnable.

## Releases

Version lives in three files kept in sync by `node scripts/set-version.mjs <semver>`
(`tauri build` refuses to run if they drift). Tagging `v*` creates the GitLab
Release; the macOS `.dmg` is built locally and attached via `pnpm release:dmg`.
