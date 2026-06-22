# AndyMD on iOS

AndyMD's iOS build reuses the existing React + Milkdown frontend and the same
Rust core, wrapped in a Tauri 2 mobile shell (WKWebView). This document covers
how to build it, what changed for mobile, and the known limitations.

> **You need a Mac with Xcode to build the iOS app.** Tauri's `ios init` /
> `ios build` generate and drive an Xcode project; they cannot run on Linux/CI
> without macOS. All of the *code* changes below are platform-portable and the
> desktop build is unchanged.

## Building

```bash
pnpm install

# One-time: generate the Xcode project under src-tauri/gen/apple.
pnpm ios:init

# Run on the simulator (or a connected device with a signing team set).
pnpm ios:dev

# Produce an .ipa / archive.
pnpm ios:build
```

`ios:init` creates `src-tauri/gen/apple/` (an Xcode project + `Info.plist`).
That directory is macOS-generated and is **not** committed here — run
`pnpm ios:init` on your Mac first. After it exists, set your Apple **development
team** in `src-tauri/tauri.conf.json` under `bundle.iOS.developmentTeam` (or in
Xcode) so device builds can sign.

### Info.plist additions

When you want the system document picker / Files-app integration to present
nicely, add these usage strings to the generated `Info.plist`:

- `UISupportsDocumentBrowser` = `YES` and/or `LSSupportsOpeningDocumentsInPlace`
  = `YES` so the app's vault shows under *Files → On My iPhone → AndyMD*.
- `NSPhotoLibraryUsageDescription` if you wire image import from the photo
  library.

## What changed for mobile

The desktop app assumes a lot of desktop-only capability. Those pieces are now
gated so the same crate compiles for both desktop and iOS:

| Area | Desktop | iOS |
| --- | --- | --- |
| Native menu bar (`menu.rs`) | Full app menu | `#[cfg(desktop)]`; `rebuild_recent_menu` is a no-op |
| File watcher (`watcher.rs`) | `notify` watcher emits `workspace-changed` | No-op `WatcherState` (no inotify-style backend) |
| Trash (`delete_to_trash`) | System Trash via `trash` crate | Direct `fs::remove_*` from the sandbox |
| Reveal in Finder | `open -R` | No-op (UI hides the action) |
| Export via pandoc | Spawns `pandoc` | Returns an error (no subprocesses on iOS) |
| Fullscreen toggle | Window fullscreen | No-op (apps are always fullscreen) |
| In-app updater + relaunch | `tauri-plugin-updater` / `-process` | Not registered — App Store handles updates |
| Config dir | `dirs`/Application Support | Tauri `app_config_dir()` (sandbox) |

Dependency gating lives in `src-tauri/Cargo.toml`: `notify`, `trash`,
`tauri-plugin-updater`, and `tauri-plugin-process` are only pulled in for
non-iOS/Android targets.

Capabilities are split:

- `capabilities/default.json` — cross-platform (`core`, `opener`).
- `capabilities/desktop.json` — desktop-only (`window:allow-start-dragging`,
  `updater`, `process`), scoped via `"platforms"`.

### Frontend

- `src/lib/platform.ts` — `isIOS()` / `isMobile()` plus a `useIsNarrow()` hook.
- `src/App.tsx` — on a narrow viewport the sidebar becomes an overlay **drawer**
  (backdrop tap to dismiss, auto-closes when a file opens); the editor always
  gets full width. Desktop keeps its resizable pane.
- `src/styles/mobile.css` — drawer styling and iOS **safe-area** insets (notch /
  home indicator), scoped to `#app-root.is-narrow`.
- `src/lib/updater.ts` — `runUpdateCheck()` is a no-op on mobile.
- Bootstrap (`src/main.tsx`) — when there's no remembered workspace on iOS, the
  app opens its sandbox **Documents** vault (`default_vault_dir`, seeded with a
  `Welcome.md`).

## Storage model & known limitations

iOS is sandboxed: arbitrary filesystem paths don't work the way they do on
desktop. The default, fully-working vault is the app's **Documents** directory
(`default_vault_dir`) — it's writable with plain `std::fs`, shows up in the
Files app, and syncs via iCloud when enabled. Notes, the file tree, wikilinks,
images, and version history all work against it.

The **document picker** (`pick_workspace_dir` / `pick_markdown_file`) still
exists, but a folder the user picks **outside** the sandbox is only reachable
through a *security-scoped bookmark*, which requires native Swift
(`startAccessingSecurityScopedResource` + bookmark persistence) that can't be
authored/verified without a Mac. Today, picking an external folder returns its
path but our `std::fs`-based commands won't have durable access to it.

**Follow-up to fully honor external folders on iOS:** add a small Tauri iOS
plugin (Swift) that:

1. resolves the picked URL, starts security-scoped access, and
2. persists a bookmark so the vault re-opens across launches,

then route `read_file`/`write_file`/`list_workspace` through it. Until then,
keep vaults in the app Documents directory (import into it via the picker).

## Verifiability note

This port was developed on Linux, so the iOS target itself could not be
compiled or run here (no Xcode). What *was* verified: the desktop Rust build
(`cargo check` + `cargo test`), the full frontend type-check (`tsc -b`), and the
Vitest suite all pass with these changes. The mobile (`#[cfg(mobile)]`) paths
are written to Tauri 2's mobile conventions but should be built once on a Mac
via `pnpm ios:dev`.
