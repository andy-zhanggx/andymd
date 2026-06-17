---
feature: auto-update
type: features
execution_strategy: subagent
reason: Cross-module (TS lib/store/UI → Rust/config → release script → signing) with sequential dependencies; large surface.
---

# Auto-Update Implementation Plan

> **For agentic workers:** This plan will be executed via andypower:executing-plans. The execution strategy is declared in the frontmatter above.

**Goal:** Authenticated in-app auto-update from internal GitLab — silent background download with a title-bar "Restart to update" button, plus a manual "Software Update…" dialog.

**Architecture:** Pure, unit-tested core (`updater.ts` helpers, `updateStore`, `UpdateButtonView`) drives the UI; thin Tauri glue (dynamic-imported `@tauri-apps/plugin-updater`/`-process`) performs the actual check/download/install. The Rust side registers the updater + process plugins; `tauri.conf.json` points the updater at a GitLab `latest.json` and embeds the minisign public key. A local release script builds, signs, and uploads the tarball + manifest.

**Tech Stack:** TypeScript, React 18, Zustand, Tauri v2 (`tauri-plugin-updater`, `tauri-plugin-process`), Vitest (node + react-dom/server), GitLab Generic Package Registry.

**Working directory:** the worktree at `.worktrees/auto-update` (branch `feat/auto-update`, off `main`). All paths are relative to it.

**Verification note:** the frontend logic is unit-tested + typechecked here. The Rust build, signing, real download/install/relaunch, and Gatekeeper behavior are **not** verifiable in this environment — Task 12 is a manual checklist for the user's Apple-Silicon machine. Do NOT start the Vite dev server (broken cold-start); verify via `npx vitest run` + `npx tsc -b`.

---

## File Structure

- `src/lib/updater.ts` (new) — pure helpers (`buildAuthHeaders`, `shouldCheckNow`, `effectiveToken`, `UPDATE_CHECK_INTERVAL_MS`) + Tauri glue (`runUpdateCheck`, `installAndRelaunch`) using **dynamic** imports so tests never load Tauri modules.
- `src/lib/updater.test.ts` (new) — unit tests for the pure helpers.
- `src/stores/updateStore.ts` (new) + `src/stores/updateStore.test.ts` (new).
- `src/components/UpdateButton.tsx` (new) + `src/components/UpdateButton.test.tsx` (new).
- `src/components/UpdateSettings.tsx` (new) — manual dialog.
- `scripts/release-update.mjs` (new) — build/sign/upload tarball + latest.json.
- `src/types.ts` (modify), `src/stores/uiStore.ts` (modify), `src/components/TitleBar.tsx` (modify), `src/App.tsx` (modify), `src/hooks/useShortcuts.ts` (modify), `src/styles/chrome.css` (modify).
- `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json` (modify), `package.json` (modify), `.gitignore` (modify).

---

## Task 0: Install plugin dependencies (run first)

The updater/process packages must exist before any later `tsc -b` gate, because
`updater.ts` dynamic-imports their types. The worktree resolves `node_modules`
from the parent checkout, but these packages are new, so install them now.

**Files:**
- Modify: `package.json`, `src-tauri/Cargo.toml`

- [ ] **Step 1: Add JS deps**

Run: `pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process`
Expected: both added to `dependencies` at `^2.x`. If this fails for lack of
registry access, STOP and report BLOCKED — the feature cannot typecheck or build
without them.

- [ ] **Step 2: Add Rust deps**

In `src-tauri/Cargo.toml`, under `[dependencies]` after `tauri-plugin-opener = "2"`:

```toml
tauri-plugin-updater = "2"
tauri-plugin-process = "2"
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml src-tauri/Cargo.toml
git commit -m "build(auto-update): add updater + process plugin deps"
```

---

## Task 1: Updater pure helpers

**Files:**
- Create: `src/lib/updater.ts`
- Test: `src/lib/updater.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/updater.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildAuthHeaders,
  shouldCheckNow,
  effectiveToken,
  UPDATE_CHECK_INTERVAL_MS,
} from './updater';

describe('buildAuthHeaders', () => {
  it('returns a PRIVATE-TOKEN header when a token is present', () => {
    expect(buildAuthHeaders('abc')).toEqual({ 'PRIVATE-TOKEN': 'abc' });
  });
  it('returns no headers for empty/null token', () => {
    expect(buildAuthHeaders('')).toEqual({});
    expect(buildAuthHeaders(null)).toEqual({});
    expect(buildAuthHeaders(undefined)).toEqual({});
  });
});

describe('shouldCheckNow', () => {
  it('checks when never checked before', () => {
    expect(shouldCheckNow(null, 1_000_000, UPDATE_CHECK_INTERVAL_MS)).toBe(true);
  });
  it('does not check within the interval', () => {
    const now = 1_000_000;
    expect(shouldCheckNow(now - 1000, now, UPDATE_CHECK_INTERVAL_MS)).toBe(false);
  });
  it('checks once the interval has elapsed', () => {
    const now = 100_000_000;
    expect(shouldCheckNow(now - UPDATE_CHECK_INTERVAL_MS - 1, now, UPDATE_CHECK_INTERVAL_MS)).toBe(true);
  });
});

describe('effectiveToken', () => {
  it('prefers the config token', () => {
    expect(effectiveToken('cfg')).toBe('cfg');
  });
  it('falls back to empty string when config is blank and no env', () => {
    // VITE_GITLAB_TOKEN is unset in the test env.
    expect(effectiveToken('')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/updater.test.ts`
Expected: FAIL — `Failed to resolve import "./updater"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/updater.ts`:

```ts
import { useUpdateStore } from '../stores/updateStore';

/** How often to auto-check for updates while the app runs (6 hours). */
export const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** GitLab auth headers for the updater requests, or {} when no token. */
export function buildAuthHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { 'PRIVATE-TOKEN': token } : {};
}

/** True when enough time has elapsed since the last check (null = never). */
export function shouldCheckNow(
  lastCheckedAt: number | null,
  now: number,
  intervalMs: number,
): boolean {
  if (lastCheckedAt === null) return true;
  return now - lastCheckedAt >= intervalMs;
}

/** Effective token: config value, else the dev-only env fallback. */
export function effectiveToken(configToken: string): string {
  if (configToken) return configToken;
  const env = (import.meta as unknown as { env?: Record<string, string> }).env;
  return env?.VITE_GITLAB_TOKEN ?? '';
}

// --- Tauri glue (dynamic-imported so unit tests never load Tauri) ----------

/** Module-scoped handle to the staged update, set on download. */
let stagedUpdate: { install: () => Promise<void> } | null = null;

/**
 * Check GitLab for a newer version and, if found, download it silently.
 * Drives `updateStore`. No-ops (no error UI) when no token or not yet due.
 */
export async function runUpdateCheck(force = false): Promise<void> {
  const store = useUpdateStore.getState();
  const cfg = (await import('../stores/configStore')).useConfigStore.getState();
  const token = effectiveToken(cfg.config.updateToken);
  if (!token) return;
  const now = Date.now();
  if (!force && !shouldCheckNow(store.lastCheckedAt, now, UPDATE_CHECK_INTERVAL_MS)) return;

  try {
    store.setChecking();
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check({ headers: buildAuthHeaders(token), timeout: 30_000 });
    if (!update) {
      store.setIdle(Date.now());
      return;
    }
    store.setDownloading(update.version);
    await update.download();
    stagedUpdate = update;
    store.setReady();
  } catch (e) {
    console.error('update check failed', e);
    store.setError();
  }
}

/** Install the staged update and relaunch. */
export async function installAndRelaunch(): Promise<void> {
  try {
    if (!stagedUpdate) return;
    await stagedUpdate.install();
    const { relaunch } = await import('@tauri-apps/plugin-process');
    await relaunch();
  } catch (e) {
    console.error('update install failed', e);
    window.alert(`Update install failed: ${e}`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/updater.test.ts`
Expected: PASS (4 describe blocks). The Tauri glue is present but not invoked by the test (dynamic imports).

- [ ] **Step 5: Commit**

```bash
git add src/lib/updater.ts src/lib/updater.test.ts
git commit -m "feat(auto-update): updater helpers + tauri glue"
```

> Note: Task 1 imports `useUpdateStore` (Task 3) and `useConfigStore`/`updateToken` (Task 2). Execute Tasks 2 and 3 before running `npx tsc -b`; the isolated vitest run in Step 4 passes because the store import resolves at runtime only when the glue is called. If Step 4's run errors on the missing import, do Task 3 first, then return here.

---

## Task 2: `updateToken` in AppConfig

**Files:**
- Modify: `src/types.ts`
- Test: `src/lib/updateToken-default.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/updateToken-default.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../types';

describe('DEFAULT_CONFIG.updateToken', () => {
  it('defaults to an empty string', () => {
    expect(DEFAULT_CONFIG.updateToken).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/updateToken-default.test.ts`
Expected: FAIL — property missing / `undefined`.

- [ ] **Step 3: Write the implementation**

In `src/types.ts`, add to the `AppConfig` interface after `lastSeenVersion`:

```ts
  lastSeenVersion: string | null;  // app version last shown in "What's New" (null = never)
  updateToken: string;             // GitLab PAT for authenticated auto-update (blank = disabled)
```

And in `DEFAULT_CONFIG` after `lastSeenVersion: null,`:

```ts
  lastSeenVersion: null,
  updateToken: '',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/updateToken-default.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/updateToken-default.test.ts
git commit -m "feat(auto-update): updateToken config field"
```

---

## Task 3: updateStore

**Files:**
- Create: `src/stores/updateStore.ts`
- Test: `src/stores/updateStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/stores/updateStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUpdateStore } from './updateStore';

describe('updateStore', () => {
  beforeEach(() => {
    useUpdateStore.setState({ status: 'idle', availableVersion: null, lastCheckedAt: null });
  });

  it('transitions through the check/download/ready lifecycle', () => {
    const s = () => useUpdateStore.getState();
    s().setChecking();
    expect(s().status).toBe('checking');
    s().setDownloading('0.2.0');
    expect(s().status).toBe('downloading');
    expect(s().availableVersion).toBe('0.2.0');
    s().setReady();
    expect(s().status).toBe('ready');
  });

  it('records lastCheckedAt when going idle', () => {
    useUpdateStore.getState().setIdle(12345);
    expect(useUpdateStore.getState().status).toBe('idle');
    expect(useUpdateStore.getState().lastCheckedAt).toBe(12345);
  });

  it('sets error status', () => {
    useUpdateStore.getState().setError();
    expect(useUpdateStore.getState().status).toBe('error');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/updateStore.test.ts`
Expected: FAIL — `Failed to resolve import "./updateStore"`.

- [ ] **Step 3: Write the implementation**

Create `src/stores/updateStore.ts`:

```ts
import { create } from 'zustand';

export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'error';

interface UpdateState {
  status: UpdateStatus;
  availableVersion: string | null;
  lastCheckedAt: number | null;
  setChecking: () => void;
  setDownloading: (version: string) => void;
  setReady: () => void;
  setIdle: (checkedAt: number) => void;
  setError: () => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  status: 'idle',
  availableVersion: null,
  lastCheckedAt: null,
  setChecking: () => set({ status: 'checking' }),
  setDownloading: (version) => set({ status: 'downloading', availableVersion: version }),
  setReady: () => set({ status: 'ready' }),
  setIdle: (checkedAt) => set({ status: 'idle', lastCheckedAt: checkedAt }),
  setError: () => set({ status: 'error' }),
}));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/updateStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/updateStore.ts src/stores/updateStore.test.ts
git commit -m "feat(auto-update): update status store"
```

---

## Task 4: uiStore flag for the Update Settings dialog

**Files:**
- Modify: `src/stores/uiStore.ts`

- [ ] **Step 1: Add the state**

In `src/stores/uiStore.ts`, add to the `UIState` interface (after the tour block):

```ts
  // Software Update settings dialog
  updateSettingsOpen: boolean;
  setUpdateSettingsOpen: (open: boolean) => void;
```

Add to the `create(...)` body (after `endTour: ...`):

```ts
  updateSettingsOpen: false,
  setUpdateSettingsOpen: (open) => set({ updateSettingsOpen: open }),
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0 (Tasks 1–3 must be done so imports resolve).

- [ ] **Step 3: Commit**

```bash
git add src/stores/uiStore.ts
git commit -m "feat(auto-update): uiStore flag for update settings dialog"
```

---

## Task 5: UpdateButton (title-bar affordance)

**Files:**
- Create: `src/components/UpdateButton.tsx`
- Test: `src/components/UpdateButton.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/components/UpdateButton.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { UpdateButtonView } from './UpdateButton';

describe('UpdateButtonView', () => {
  it('shows a restart button when ready', () => {
    const html = renderToStaticMarkup(
      <UpdateButtonView status="ready" version="0.2.0" onRestart={() => {}} />,
    );
    expect(html).toContain('Restart to update');
  });
  it('shows updating text while downloading', () => {
    const html = renderToStaticMarkup(
      <UpdateButtonView status="downloading" version="0.2.0" onRestart={() => {}} />,
    );
    expect(html.toLowerCase()).toContain('updating');
  });
  it('renders nothing when idle', () => {
    const html = renderToStaticMarkup(
      <UpdateButtonView status="idle" version={null} onRestart={() => {}} />,
    );
    expect(html).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/UpdateButton.test.tsx`
Expected: FAIL — `Failed to resolve import "./UpdateButton"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/UpdateButton.tsx`:

```tsx
import { useUpdateStore } from '../stores/updateStore';
import { installAndRelaunch } from '../lib/updater';
import type { UpdateStatus } from '../stores/updateStore';

export function UpdateButtonView({
  status,
  version,
  onRestart,
}: {
  status: UpdateStatus;
  version: string | null;
  onRestart: () => void;
}) {
  if (status === 'ready') {
    return (
      <button
        className="update-btn"
        onClick={onRestart}
        title={version ? `Update ${version} downloaded — restart to apply` : 'Restart to update'}
      >
        Restart to update
      </button>
    );
  }
  if (status === 'downloading') {
    return <span className="update-downloading">Updating…</span>;
  }
  return null;
}

export function UpdateButton() {
  const status = useUpdateStore((s) => s.status);
  const version = useUpdateStore((s) => s.availableVersion);
  return <UpdateButtonView status={status} version={version} onRestart={() => void installAndRelaunch()} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/UpdateButton.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/UpdateButton.tsx src/components/UpdateButton.test.tsx
git commit -m "feat(auto-update): title-bar restart-to-update button"
```

---

## Task 6: UpdateSettings dialog + styles

**Files:**
- Create: `src/components/UpdateSettings.tsx`
- Modify: `src/styles/chrome.css`

- [ ] **Step 1: Write the implementation**

Create `src/components/UpdateSettings.tsx`:

```tsx
import { useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useConfigStore } from '../stores/configStore';
import { useUpdateStore } from '../stores/updateStore';
import { runUpdateCheck } from '../lib/updater';

const STATUS_TEXT: Record<string, string> = {
  idle: 'Up to date.',
  checking: 'Checking for updates…',
  downloading: 'Downloading update…',
  ready: 'Update downloaded — restart to apply.',
  error: 'Last check failed.',
};

export function UpdateSettings() {
  const open = useUIStore((s) => s.updateSettingsOpen);
  const close = () => useUIStore.getState().setUpdateSettingsOpen(false);
  const token = useConfigStore((s) => s.config.updateToken);
  const update = useConfigStore((s) => s.update);
  const status = useUpdateStore((s) => s.status);
  const [draft, setDraft] = useState(token);

  if (!open) return null;

  const statusLine = token ? STATUS_TEXT[status] ?? '' : 'No update token set.';

  return (
    <div className="update-backdrop" onClick={close}>
      <div className="update-card" role="dialog" aria-modal="true" aria-label="Software Update" onClick={(e) => e.stopPropagation()}>
        <header className="update-head">
          <h2>Software Update</h2>
          <button className="update-close" onClick={close} aria-label="Close">×</button>
        </header>
        <div className="update-body">
          <label className="update-label" htmlFor="update-token">GitLab access token</label>
          <input
            id="update-token"
            className="update-token"
            type="password"
            placeholder="Personal Access Token (read_api)"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <p className="update-status">{statusLine}</p>
        </div>
        <footer className="update-foot">
          <button className="update-secondary" onClick={() => void update({ updateToken: draft })}>Save token</button>
          <button
            className="update-primary"
            onClick={async () => {
              await update({ updateToken: draft });
              void runUpdateCheck(true);
            }}
          >
            Check for updates now
          </button>
        </footer>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `src/styles/chrome.css`:

```css
/* ── Software Update ─────────────────────────────────────────── */
.update-btn {
  margin-left: 8px;
  padding: 2px 10px;
  border: 1px solid var(--accent);
  border-radius: 6px;
  background: var(--accent);
  color: #fff;
  font-size: 0.78rem;
  cursor: pointer;
}
.update-downloading {
  margin-left: 8px;
  font-size: 0.78rem;
  color: var(--fg-muted);
}
.update-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.35);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.update-card {
  width: min(440px, 90vw);
  background: var(--bg-primary); color: var(--fg-primary);
  border: 1px solid var(--border); border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.3); overflow: hidden;
}
.update-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border); }
.update-head h2 { margin: 0; font-size: 1.05rem; }
.update-close { border: none; background: none; color: var(--fg-secondary); font-size: 1.3rem; line-height: 1; cursor: pointer; }
.update-body { padding: 14px 18px; }
.update-label { display: block; font-size: 0.8rem; color: var(--fg-secondary); margin-bottom: 4px; }
.update-token { width: 100%; padding: 7px 9px; border: 1px solid var(--border); border-radius: 7px; background: var(--bg-secondary, rgba(127,127,127,0.08)); color: var(--fg); font-size: 0.9rem; box-sizing: border-box; }
.update-status { margin: 10px 0 0; font-size: 0.85rem; color: var(--fg-muted); }
.update-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px 16px; border-top: 1px solid var(--border); }
.update-secondary { padding: 6px 14px; border: 1px solid var(--border); border-radius: 7px; background: transparent; color: var(--fg); cursor: pointer; font-size: 0.85rem; }
.update-primary { padding: 6px 14px; border: 1px solid var(--accent); border-radius: 7px; background: var(--accent); color: #fff; cursor: pointer; font-size: 0.85rem; }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/UpdateSettings.tsx src/styles/chrome.css
git commit -m "feat(auto-update): software update settings dialog"
```

---

## Task 7: Wire title bar, startup/interval check, dialog, and menu

**Files:**
- Modify: `src/components/TitleBar.tsx`
- Modify: `src/App.tsx`
- Modify: `src/hooks/useShortcuts.ts`
- Modify: `src-tauri/src/menu.rs`

- [ ] **Step 1: Title bar button**

In `src/components/TitleBar.tsx`, add the import at the top:

```ts
import { UpdateButton } from './UpdateButton';
```

Render it inside the title bar, right after the `titlebar-title` div:

```tsx
      <div className="titlebar-title" data-tauri-drag-region>
        {doc?.isDirty && <span className="titlebar-dirty" />}
        {name}
      </div>
      <UpdateButton />
```

- [ ] **Step 2: Startup + interval check and dialog in App**

In `src/App.tsx`, add imports after the existing component imports:

```ts
import { UpdateSettings } from './components/UpdateSettings';
import { runUpdateCheck, UPDATE_CHECK_INTERVAL_MS } from './lib/updater';
```

Add an effect after the existing `configLoaded` effects:

```ts
  // Auto-update: check on launch + on an interval while the app runs.
  useEffect(() => {
    if (!configLoaded) return;
    void runUpdateCheck();
    const id = window.setInterval(() => void runUpdateCheck(), UPDATE_CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [configLoaded]);
```

Render the dialog next to the other top-level dialogs (after `<Tour />` / `<WhatsNew />`):

```tsx
      <Tour />
      <WhatsNew />
      <UpdateSettings />
    </div>
```

> If `<WhatsNew />` is not present on this branch base, add `<UpdateSettings />` right after `<Tour />`.

- [ ] **Step 3: Menu event handler**

In `src/hooks/useShortcuts.ts`, add the import near the other lib imports:

```ts
import { useUIStore } from '../stores/uiStore';
```
(already imported — skip if present). Add a case next to `case 'show-tour':`:

```ts
    case 'software-update':
      useUIStore.getState().setUpdateSettingsOpen(true);
      break;
```

- [ ] **Step 4: Native menu item**

In `src-tauri/src/menu.rs`, add to the `help_menu` builder:

```rust
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("show-tour", "Welcome Tour").build(app)?)
        .item(&MenuItemBuilder::with_id("software-update", "Software Update…").build(app)?)
        .build()?;
```
(If a `show-whats-new` item also exists, keep it; just add `software-update`.)

- [ ] **Step 5: Typecheck + tests**

Run: `npx tsc -b && npx vitest run`
Expected: tsc exit 0; all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/TitleBar.tsx src/App.tsx src/hooks/useShortcuts.ts src-tauri/src/menu.rs
git commit -m "feat(auto-update): wire title-bar button, startup check, and menu"
```

---

## Task 8: Verify Rust resolution (best-effort)

Dependencies were added in Task 0. Confirm the native side resolves.

- [ ] **Step 1: Best-effort cargo check**

Run (may be slow / need network): `cd src-tauri && cargo fetch && cargo check`
Expected: compiles. If it cannot run offline, note it and continue — Task 12
covers the real build. No commit (nothing changed).

---

## Task 9: Generate the signing key

**Files:** none committed (key is gitignored). Modifies `.gitignore`.

- [ ] **Step 1: Ignore the key file**

Append to `.gitignore`:

```
# Tauri updater signing key (NEVER commit)
*.key
*.key.pub
```

- [ ] **Step 2: Generate the keypair (no-password / CI style)**

Run: `npx @tauri-apps/cli signer generate -w ./andymd-updater.key --password ""`
Expected: prints the **public key** (base64) and writes the private key to `./andymd-updater.key`. Capture both from stdout / the files (`andymd-updater.key`, `andymd-updater.key.pub`).

- [ ] **Step 3: Record the public key for Task 10 and surface the secret**

- Read `andymd-updater.key.pub` (public key) — used verbatim in Task 10.
- Read `andymd-updater.key` (private key) — this is the secret to hand to the user. **Do not commit it.** Include its full contents in the final report so the user can store it (password manager + CI variable `TAURI_SIGNING_PRIVATE_KEY`; password is empty).

- [ ] **Step 4: Commit (gitignore only)**

```bash
git add .gitignore
git commit -m "chore(auto-update): gitignore the updater signing key"
```

---

## Task 10: Tauri updater config

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Register the plugins in lib.rs**

In `src-tauri/src/lib.rs`, extend the builder chain:

```rust
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
```

- [ ] **Step 2: Updater config in tauri.conf.json**

Set `bundle.createUpdaterArtifacts` to `true` (add the key inside the existing `"bundle"` object), and add a top-level `"plugins"` object (sibling of `"bundle"`). Use the **public key from Task 9** verbatim:

```json
  "bundle": {
    "active": true,
    "createUpdaterArtifacts": true,
    ...existing keys...
  },
  "plugins": {
    "updater": {
      "pubkey": "<PASTE andymd-updater.key.pub CONTENTS>",
      "endpoints": [
        "https://git.garena.com/api/v4/projects/134118/packages/generic/andymd/latest/latest.json"
      ]
    }
  }
```

- [ ] **Step 3: Capabilities**

In `src-tauri/capabilities/default.json`, add to the `permissions` array:

```json
    "opener:default",
    "updater:default",
    "process:default",
    "process:allow-restart"
```

- [ ] **Step 4: Verify config validity**

Run: `python3 -c "import json; json.load(open('src-tauri/tauri.conf.json')); json.load(open('src-tauri/capabilities/default.json')); print('json ok')"`
Expected: `json ok`.
Run (best-effort): `cd src-tauri && cargo check`
Expected: compiles. If offline/unavailable, note and defer to Task 12.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/src/lib.rs src-tauri/capabilities/default.json
git commit -m "feat(auto-update): register updater/process plugins + config"
```

---

## Task 11: Release script (build → sign → upload)

**Files:**
- Create: `scripts/release-update.mjs`
- Modify: `package.json` (add a `release:update` script)

- [ ] **Step 1: Write the script**

Create `scripts/release-update.mjs`:

```js
#!/usr/bin/env node
// Upload the locally-built, signed updater artifacts to GitLab and publish the
// `latest.json` manifest the in-app updater reads.
//
//   pnpm version:set <x.y.z>   # commit + tag + push (CI creates the release)
//   TAURI_SIGNING_PRIVATE_KEY="$(cat andymd-updater.key)" \
//   TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" \
//     pnpm tauri build         # → bundle/macos/*.app.tar.gz + .sig
//   pnpm release:update        # this script
//
// Needs $GITLAB_TOKEN (or the token embedded in `origin`).
import { readFileSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const die = (m) => { console.error(`✗ ${m}`); process.exit(1); };

const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const tag = `v${version}`;

const origin = execSync('git config --get remote.origin.url', { cwd: root }).toString().trim();
const m = origin.match(/^https?:\/\/(?:[^@]*@)?([^/]+)\/(.+?)(?:\.git)?$/);
if (!m) die(`could not parse a GitLab https URL from origin: ${origin}`);
const [, host, projectPath] = m;
const projectId = '134118';
const api = `https://${host}/api/v4/projects/${encodeURIComponent(projectPath)}`;
const idApi = `https://${host}/api/v4/projects/${projectId}`;

const token = process.env.GITLAB_TOKEN || (origin.match(/\/\/[^:]*:([^@]+)@/) || [])[1];
if (!token) die('no GitLab token — set $GITLAB_TOKEN');
const auth = { 'PRIVATE-TOKEN': token };

async function gl(method, url, opts = {}) {
  const res = await fetch(url, { method, headers: { ...auth, ...(opts.headers || {}) }, body: opts.body });
  if (!res.ok && res.status !== 404) die(`${method} ${url.replace(/\/\/[^/]+/, '//…')} → ${res.status} ${await res.text()}`);
  return res.status === 204 || res.status === 404 ? null : res.json().catch(() => null);
}

// Locate the signed updater tarball + signature.
const macDir = join(root, 'src-tauri/target/release/bundle/macos');
let tar;
try {
  tar = readdirSync(macDir).find((f) => /\.app\.tar\.gz$/.test(f));
} catch { die(`no bundle dir at ${macDir} — run a signed \`pnpm tauri build\` first`); }
if (!tar) die(`no *.app.tar.gz in ${macDir} — ensure createUpdaterArtifacts + signing env are set`);
const sig = `${tar}.sig`;
const signature = readFileSync(join(macDir, sig), 'utf8').trim();

const tarName = `AndyMD_${version}_aarch64.app.tar.gz`;
const tarUrl = `${api}/packages/generic/andymd/${tag}/${tarName}`;
const latestUrl = `${api}/packages/generic/andymd/latest/latest.json`;
// The URL the app downloads is the numeric-id form (stable across renames).
const downloadUrl = `${idApi}/packages/generic/andymd/${tag}/${tarName}`;

// 1. Upload the tarball.
console.log(`↑ ${tarName} → packages/generic/andymd/${tag}/`);
await gl('PUT', tarUrl, { body: readFileSync(join(macDir, tar)) });

// 2. Build + upload latest.json (overwrite the stable `latest` package).
const notes = extractNotes(version);
const manifest = {
  version,
  notes,
  pub_date: process.env.PUB_DATE || new Date().toISOString(),
  platforms: { 'darwin-aarch64': { signature, url: downloadUrl } },
};
console.log(`↑ latest.json (v${version}) → packages/generic/andymd/latest/`);
await gl('PUT', latestUrl, {
  body: JSON.stringify(manifest, null, 2),
  headers: { 'Content-Type': 'application/json' },
});

console.log(`✓ published updater manifest for ${tag}`);
console.log(`  endpoint: ${latestUrl.replace(api, idApi)}`);

/** Pull this version's bullet lines out of CHANGELOG.md for the `notes` field. */
function extractNotes(ver) {
  let md;
  try { md = readFileSync(join(root, 'CHANGELOG.md'), 'utf8'); } catch { return ''; }
  const lines = md.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+\\[${ver.replace(/\./g, '\\.')}\\]`).test(l));
  if (start < 0) return '';
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+\[/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out.join('\n').trim();
}
```

- [ ] **Step 2: Add the npm script**

In `package.json` `"scripts"`, after `"release:dmg": "...",` add:

```json
    "release:update": "node scripts/release-update.mjs",
```

- [ ] **Step 3: Syntax check**

Run: `node --check scripts/release-update.mjs`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/release-update.mjs package.json
git commit -m "build(auto-update): release script for signed updater artifacts"
```

---

## Task 12: Manual verification checklist (user's Apple-Silicon machine)

**Files:** none. This task is a documented checklist — it is NOT executed by the agent. Record it in the final report.

- [ ] Build with signing env set:
  `TAURI_SIGNING_PRIVATE_KEY="$(cat andymd-updater.key)" TAURI_SIGNING_PRIVATE_KEY_PASSWORD="" pnpm tauri build`
  → confirm `src-tauri/target/release/bundle/macos/*.app.tar.gz` and `.sig` exist.
- [ ] Bump to a test version (e.g. current+0.0.1), tag/push, build+sign, run `pnpm release:update`; confirm the GitLab generic package `andymd/latest/latest.json` is reachable **with** a `PRIVATE-TOKEN` header and returns the new manifest.
- [ ] Launch the *older* installed build, open **Help → Software Update…**, paste a PAT (scope `read_api`), Save, **Check now** → button reaches "Restart to update".
- [ ] Click **Restart to update** → app installs and relaunches on the new version; What's New shows the changes.
- [ ] **Gatekeeper:** confirm macOS does not block the self-applied update. If it does, notarization (Apple Developer ID) is required before auto-update is usable — capture the exact dialog/error for a follow-up.

---

## Task 13: Final verification

- [ ] Run the full suite: `npx vitest run` → all tests pass (new: `updater`, `updateToken-default`, `updateStore`, `UpdateButton`).
- [ ] Typecheck: `npx tsc -b` → exit 0.
- [ ] Confirm working tree clean: `git status --short`.

---

## Self-Review

**Spec coverage:**
- Token config field + effective-token fallback → Task 2, Task 1 (`effectiveToken`). ✓
- Auth header on requests → Task 1 (`buildAuthHeaders`), used in `runUpdateCheck`. ✓
- Launch + interval check → Task 7 (App effect + `setInterval`). ✓
- Silent download → ready → title-bar button → Task 1 (`runUpdateCheck`), Task 3 (store), Task 5 (button). ✓
- Restart installs + relaunches → Task 1 (`installAndRelaunch`), Task 5 wiring. ✓
- Manual Software Update dialog (token, check now, status) → Task 6 + Task 7 menu. ✓
- Plugins + config + capabilities → Tasks 8, 10. ✓
- Signing key (I generate, user stores; pubkey in config) → Task 9, Task 10. ✓
- Release script (build/sign/upload tarball + latest.json) → Task 11. ✓
- Error-safe / no-nag → `runUpdateCheck` try/catch + no-token guard (Task 1). ✓
- Manual verification of download/install/Gatekeeper → Task 12. ✓
- Styles → Task 6. ✓

**Placeholder scan:** the only intentional fill-in is the public key in Task 10 Step 2, which is produced by Task 9 and explicitly read from `andymd-updater.key.pub` — not a placeholder left to the engineer's imagination. No TODO/TBD elsewhere.

**Type consistency:** `UpdateStatus` and store actions (`setChecking/setDownloading/setReady/setIdle/setError`) defined in Task 3, consumed identically in Tasks 1, 5, 6. `updateToken` defined in Task 2, read in Tasks 1, 6. `runUpdateCheck`/`installAndRelaunch`/`UPDATE_CHECK_INTERVAL_MS` from Task 1 used in Tasks 5, 6, 7. Menu id `software-update` matches between Task 7 Rust and TS.

**Scope:** one cohesive feature; the unbuildable-here parts (Rust/signing/release/Gatekeeper) are isolated into Tasks 9–12 with explicit best-effort/manual notes.
