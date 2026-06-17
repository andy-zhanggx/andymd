# Feature: In-app auto-update (GitLab, authenticated)

## Summary

AndyMD checks the internal GitLab for a newer release, silently downloads it in
the background, and surfaces a **"Restart to update"** button in the title bar.
Clicking it installs the staged update and relaunches; the existing "What's New"
popup then shows what changed.

Because the GitLab project is `internal` (not anonymously downloadable), every
updater request carries a GitLab **Personal Access Token (PAT)** as a header.
The token is supplied by the user once (a small Update Settings dialog) and
persisted in app config, falling back to `$GITLAB_TOKEN` in dev.

This is the second of the two version-management features; it builds on
"What's New" (already merged) — after a self-update + relaunch, What's New
surfaces the changes.

## Goals

- Check for updates on launch and on an interval (default every 6 hours) while
  running, when a token is configured.
- Download a newer version silently; show a non-intrusive "Restart to update"
  button in the title bar when staged.
- Click → install + relaunch.
- A manual "Software Update…" dialog: set/clear the PAT, "Check now", and see
  current status.
- Authenticated against internal GitLab via a per-user PAT (header), no public
  exposure.
- Degrade safely: no token / offline / error → no UI noise, never blocks
  startup.

## Non-goals

- No anonymous/public update channel (GitLab is `internal`; see the rejected
  alternatives in the brainstorm history).
- No forced/auto-install without the user clicking restart.
- No Windows/Linux/Intel-mac artifacts — local builds are `darwin-aarch64`
  (Apple Silicon) only; the manifest declares only that platform.
- No OS-keychain token storage in v1 (config-file plaintext; see Risks).

## Behavior

### Token

- `AppConfig.updateToken: string` (default `''`).
- Effective token at runtime: `config.updateToken || import.meta.env.VITE_GITLAB_TOKEN || ''`
  (the env fallback is dev-only convenience; production uses the config value).
- With **no** effective token, automatic checks are skipped entirely (no
  errors, no UI). The user can still open Update Settings to paste one.

### Automatic check (launch + interval)

After config loads (alongside the existing What's New effect):

1. If no effective token → do nothing.
2. If `shouldCheckNow(lastCheckedAt, now, INTERVAL_MS)` is false → do nothing.
3. Else run the check (below). Schedule a repeating timer at `INTERVAL_MS`
   (default 6h) that repeats the check while the app runs.

### Check → download → ready (the state machine)

`updateStore.status`: `idle | checking | downloading | ready | error`.

1. `checking`: call the updater with the auth header.
2. If no update → back to `idle`, record `lastCheckedAt`.
3. If update available → `downloading`: store `availableVersion`, start the
   background download.
4. On download complete → `ready` (the update is staged on disk).
5. Any failure → `error` (logged, status returns to `idle` on the next check;
   no popup).

### Title-bar button

- `status === 'ready'` → show **"Restart to update"** button in `TitleBar`.
  Click → install the staged update + `relaunch()`.
- `status === 'downloading'` → optional subtle "Updating…" text (no action).
- Otherwise → nothing.

### Manual: Update Settings dialog

**Help → "Software Update…"** opens a modal with:

- A PAT text input (prefilled from `config.updateToken`), Save → persists to
  config.
- "Check for updates now" button → runs the check immediately (same flow).
- Status line reflecting `updateStore` (e.g. "Up to date", "Downloading 0.2.0…",
  "Ready — restart to update", "No update token set", "Check failed").

## Architecture

### 1. `src/lib/updater.ts`

Pure, unit-tested helpers + a thin Tauri glue layer (the glue is not unit-tested
— it calls native APIs — and is kept minimal):

```ts
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h

/** Auth headers for GitLab API/package requests, or {} when no token. */
export function buildAuthHeaders(token: string | null | undefined): Record<string, string>;
//   → token ? { 'PRIVATE-TOKEN': token } : {}

/** Whether enough time has elapsed since the last check. null = never checked. */
export function shouldCheckNow(lastCheckedAt: number | null, now: number, intervalMs: number): boolean;

/** Effective token: config value, else dev env fallback. */
export function effectiveToken(configToken: string): string;

// --- Tauri glue (isolated; manual/E2E verification only) ---
export async function runUpdateCheck(force?: boolean): Promise<void>;
//   reads token, guards on shouldCheckNow (unless force), drives updateStore,
//   calls plugin `check({ headers })` then `update.download()`.
export async function installAndRelaunch(): Promise<void>;
//   calls the staged update's `install()` then process `relaunch()`.
```

- `runUpdateCheck` uses `import { check } from '@tauri-apps/plugin-updater'` →
  `check({ headers: buildAuthHeaders(token), timeout: 30000 })`. The headers
  passed to `check()` are reused by the plugin for the artifact download, so the
  authenticated manifest **and** tarball both work. (Confirm during
  implementation: if the download 401s, set the same headers on the
  `tauri.conf.json` `plugins.updater` config as well.)
- `relaunch` from `@tauri-apps/plugin-process`.

### 2. `src/stores/updateStore.ts` (Zustand)

```ts
type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';
interface UpdateState {
  status: UpdateStatus;
  availableVersion: string | null;
  lastCheckedAt: number | null;
  setChecking(): void;
  setDownloading(version: string): void;
  setReady(): void;
  setIdle(checkedAt: number): void;
  setError(): void;
}
```

A held reference to the staged `Update` object lives in `updater.ts` module
scope (not in the store — it's not serializable), set on download and consumed
by `installAndRelaunch`.

### 3. `src/components/UpdateButton.tsx`

- `UpdateButtonView({ status, version, onRestart })` — pure presentational
  (render-tested via `react-dom/server`).
- `UpdateButton()` — container reading `updateStore`, wired to
  `installAndRelaunch`. Rendered inside `TitleBar`.

### 4. `src/components/UpdateSettings.tsx`

- Modal (mirrors existing dialog styling) gated by `uiStore.updateSettingsOpen`.
- PAT input → on Save, `configStore.update({ updateToken })`.
- "Check now" → `runUpdateCheck(true)`.
- Status text derived from `updateStore`.

### 5. Wiring

- `src/types.ts`: add `updateToken: string` to `AppConfig` + `DEFAULT_CONFIG`
  (default `''`).
- `src/stores/uiStore.ts`: `updateSettingsOpen` + `setUpdateSettingsOpen`.
- `src/components/TitleBar.tsx`: render `<UpdateButton />`.
- `src/App.tsx`: an effect (after config loads) that runs `runUpdateCheck()` and
  sets a `setInterval(runUpdateCheck, UPDATE_CHECK_INTERVAL_MS)` (cleared on
  unmount); render `<UpdateSettings />`.
- `src/hooks/useShortcuts.ts`: `case 'software-update'` → open the dialog.
- `src-tauri/src/menu.rs`: Help → `MenuItemBuilder::with_id("software-update", "Software Update…")`.

### 6. Tauri plugin + config

- `package.json`: `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process`.
- `src-tauri/Cargo.toml`: `tauri-plugin-updater`, `tauri-plugin-process`.
- `src-tauri/src/lib.rs`: register both plugins
  (`.plugin(tauri_plugin_updater::Builder::new().build())`,
  `.plugin(tauri_plugin_process::init())`).
- `src-tauri/tauri.conf.json`:
  ```json
  "bundle": { "createUpdaterArtifacts": true },
  "plugins": {
    "updater": {
      "pubkey": "<minisign public key>",
      "endpoints": [
        "https://git.garena.com/api/v4/projects/134118/packages/generic/andymd/latest/latest.json"
      ]
    }
  }
  ```
- `src-tauri/capabilities/*.json`: add `updater:default` and
  `process:allow-restart` (and `process:default`) permissions.

### 7. Signing key

- Generate once with `npx tauri signer generate -w ./andymd-updater.key`
  (or `-w` to a path outside the repo). The command prints/saves a **private
  key** + asks for a password.
- Public key → `tauri.conf.json` `plugins.updater.pubkey`.
- Private key + password → handed to the user to store securely (password
  manager + CI variable `TAURI_SIGNING_PRIVATE_KEY` /
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`). **Never committed.** Add the key file
  glob to `.gitignore`.

### 8. Release flow (`scripts/release-update.mjs`)

No macOS CI runner exists, so this runs locally alongside the existing
`release-dmg.mjs`:

1. `TAURI_SIGNING_PRIVATE_KEY=… TAURI_SIGNING_PRIVATE_KEY_PASSWORD=… npx tauri build`
   → produces `AndyMD.app.tar.gz` + `AndyMD.app.tar.gz.sig` (because
   `createUpdaterArtifacts: true`).
2. Upload the tarball to GitLab generic package
   `andymd/<tag>/AndyMD_<ver>_aarch64.app.tar.gz` (reusing `release-dmg.mjs`'s
   upload helper).
3. Build `latest.json`:
   ```json
   {
     "version": "<ver>",
     "notes": "<from CHANGELOG.md for this version>",
     "pub_date": "<ISO8601>",
     "platforms": {
       "darwin-aarch64": {
         "signature": "<contents of .sig>",
         "url": "https://git.garena.com/api/v4/projects/134118/packages/generic/andymd/<tag>/AndyMD_<ver>_aarch64.app.tar.gz"
       }
     }
   }
   ```
4. Upload `latest.json` to the **stable** path
   `andymd/latest/latest.json` (idempotent: delete the prior `latest` package
   version first, then upload, so the endpoint always serves the newest).

The script documents the env vars and is idempotent/re-runnable.

## Data flow

- **Launch/interval:** App effect → `runUpdateCheck()` → `effectiveToken` →
  `check({ headers })` → if available, `update.download()` → `updateStore` →
  TitleBar button.
- **Restart click:** `installAndRelaunch()` → `update.install()` + `relaunch()`.
- **Manual:** Help menu → `useShortcuts` → open dialog → Save token / "Check now".
- **Release:** local build → sign → upload tarball + `latest.json` to GitLab.

## Error handling

Everything degrades silently (logged via console, no modal nagging):

- No token → skip checks; dialog shows "No update token set".
- `check()` / network / 401 → `status='error'` (then `idle`); no popup.
- Download failure → `status='error'`; the button does not appear.
- `install()`/`relaunch()` failure → surface a single `window.alert` (the user
  explicitly clicked restart, so a failure there is worth one message).

## Testing

Unit (vitest, node env — the testable core):

- `buildAuthHeaders`: token → `{ 'PRIVATE-TOKEN': token }`; empty/null → `{}`.
- `shouldCheckNow`: `null` lastChecked → true; within interval → false; past
  interval → true.
- `effectiveToken`: config value wins; empty config → env fallback → `''`.
- `updateStore`: each action produces the expected status/version/lastCheckedAt.

Component (vitest, `react-dom/server`):

- `UpdateButtonView`: renders the restart button only for `status==='ready'`;
  shows version; calls `onRestart`.

Not unit-testable here (documented manual verification on a real Apple-Silicon
machine):

- Real `check()` against GitLab with a PAT header (manifest 200 + parsed).
- Silent background download with the auth header (artifact 200).
- Install + relaunch swapping the bundle.
- **Gatekeeper behavior** on a non-notarized self-applied update.
- End-to-end: build+sign+upload a `0.x.y+1`, run an older build, confirm the
  button appears and restart updates the app.

The plan will include a "Manual verification checklist" task covering these.

## Files

New:
- `src/lib/updater.ts`, `src/lib/updater.test.ts`
- `src/stores/updateStore.ts`, `src/stores/updateStore.test.ts`
- `src/components/UpdateButton.tsx`, `src/components/UpdateButton.test.tsx`
- `src/components/UpdateSettings.tsx`
- `scripts/release-update.mjs`
- `docs/features-auto-update/spec.md` (this file)

Modified:
- `src/types.ts` — `updateToken`
- `src/stores/uiStore.ts` — `updateSettingsOpen`
- `src/components/TitleBar.tsx` — render `<UpdateButton />`
- `src/App.tsx` — startup + interval check, render `<UpdateSettings />`
- `src/hooks/useShortcuts.ts` — `software-update` case
- `src-tauri/src/menu.rs` — Help menu item
- `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs` — register plugins
- `src-tauri/tauri.conf.json` — updater config + `createUpdaterArtifacts`
- `src-tauri/capabilities/*.json` — updater/process permissions
- `package.json` — JS plugin deps
- `.gitignore` — exclude the signing key file
- `src/styles/chrome.css` — Update Settings dialog + title-bar button styles

## Risks / constraints (documented, not hidden)

1. **Not end-to-end verifiable in this environment** — frontend logic + wiring
   are unit-tested and typechecked; the real download/install/relaunch and
   Gatekeeper behavior require a manual run on Apple Silicon.
2. **Gatekeeper / notarization** — the app is ad-hoc signed (`"-"`), not
   notarized. A self-applied update may be blocked or warned by Gatekeeper. The
   minisign signature guarantees integrity but is independent of Apple
   notarization. Verify on a real machine; if blocked, notarization (Apple
   Developer ID) becomes a prerequisite — tracked as a follow-up, not solved
   here.
3. **Internal/on-network only** — updates work only when the user can reach
   `git.garena.com` and has supplied a valid PAT.
4. **Token in plaintext config** — acceptable for an internal personal tool;
   hardening to the OS keychain (e.g. a keyring plugin) is a possible follow-up.
5. **Single arch** — only `darwin-aarch64` is built/published.
6. **`latest.json` idempotency** — the release script must overwrite the stable
   `latest` package so the endpoint serves the newest manifest.

## Open questions

None blocking. The Gatekeeper outcome (Risk 2) is the main unknown and is
explicitly a manual-verification + possible-follow-up item, not a blocker for
implementing the mechanism.
