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

1. **`VITE_RELEASE_NAME`** — the formal release name. Releases are built by
   [`release-macos.yml`](.github/workflows/release-macos.yml) on tag push, and its
   build step sets this to the tag (`github.ref_name`, tag builds only — a
   `workflow_dispatch` run leaves it unset so no branch name leaks). For a manual
   local release build, pass it explicitly:
   ```bash
   VITE_RELEASE_NAME="v$(node -p "require('./package.json').version")" pnpm tauri build
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
(`tauri build` refuses to run if they drift). Pushing a `v*` **tag** triggers
[`release-macos.yml`](.github/workflows/release-macos.yml), which builds + signs
both arches on a GitHub-hosted Mac and publishes the per-arch `.dmg` + updater
manifest to **GitHub Releases** — the public channel the in-app updater reads.

### Release by branch + tag (the rule: every release comes from `main`)

Releases are cut on a short-lived branch off `main`, merged back, then tagged.
CI enforces this: a stable `vX.Y.Z` tag whose commit is **not reachable from
`main`** fails the build. Because the version bump must land on `main` before the
tag, the order is merge-**then**-tag:

```bash
git switch main && git pull
git switch -c release/v0.2.0          # branch off main
node scripts/set-version.mjs 0.2.0    # bump the 3 version files
#   …update CHANGELOG.md [0.2.0]…  then commit
git switch main && git merge --ff-only release/v0.2.0
git push origin main
git tag v0.2.0 && git push origin v0.2.0   # ← triggers the build
git branch -d release/v0.2.0
```

### Mac App Store (second channel)

`pnpm build:mas` builds a **different flavor** of the same source: sandboxed,
universal, no in-app updater, no pandoc export. It is driven by the `appstore`
Cargo feature (`--no-default-features --features appstore`) plus
`VITE_APP_STORE=true`, and packaged by
[`scripts/build-mas.mjs`](scripts/build-mas.mjs) into an uploadable `.pkg`.

Things to know when touching this:

- **Any new Rust code must be sandbox-safe.** No `std::process::Command`, no
  AppleScript. Paths outside the user-picked folder are unreachable.
- **A newly reachable folder needs a bookmark.** `bookmarks::store()` on every
  path the powerbox hands back, or the app loses it on relaunch. See
  [`src-tauri/src/bookmarks.rs`](src-tauri/src/bookmarks.rs).
- **Updater/process plugin permissions live in
  `capabilities/self-update.json`**, separate from `default.json`. The store
  build does not link those plugins, and Tauri validates every file in
  `capabilities/` regardless of which are enabled — so the build script parks
  that file for the duration of the build. Do not merge it back into
  `default.json`.
- **The `tauri` dependency's feature list is compared literally against
  `tauri.conf.json`**, so it cannot vary per flavor. That is why
  `macos-private-api` was removed outright rather than made conditional.

Full Apple-side procedure: [docs/mac-app-store.md](docs/mac-app-store.md).

### Long-lived branches (e.g. collab): pre-release tags

A long-lived feature branch (like `feat/collab-editing`) does **not** merge to
`main` just to hand out a test build. Tag it with a semver **pre-release** suffix
instead — `vX.Y.Z-collab.1`. Such tags are exempt from the `main` check and
publish as a GitHub **pre-release**, so `releases/latest` (the stable
auto-update channel) never serves them; testers download that release's `.dmg`
by hand. Shipping the feature to everyone still means merging to `main` and
cutting a clean `vX.Y.Z` from there.
