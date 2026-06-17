# Feature: "What's New" release-notes popup

## Summary

After a user upgrades AndyMD and launches the new version, show a modal that
lists what changed since the version they last ran. The notes come from the
bundled `CHANGELOG.md`. The popup can also be reopened on demand from the Help
menu.

This is the first of two related features. A separate spec will cover an
**auto-updater** (silent download, install on restart, sourced from GitLab
releases); after a self-update + relaunch, this popup is what surfaces the
changes. This spec covers **only** the What's New popup.

## Goals

- On first launch after a version upgrade, automatically show the changes
  between the last-seen version and the current version.
- Cover skipped versions (e.g. `0.1.1 → 0.1.4` shows `0.1.2`, `0.1.3`, `0.1.4`).
- Let the user reopen the notes anytime from **Help → What's New in AndyMD**.
- Never block or crash startup if anything goes wrong (missing version, parse
  failure, etc.).

## Non-goals

- No network access. Notes ship inside the app (bundled `CHANGELOG.md`).
- No update checking or downloading (that is the separate auto-update feature).
- No curated/marketing copy distinct from the changelog (single source of truth).
- No first-run welcome popup. A brand-new install shows nothing (there is
  already a first-run tour via `hasSeenTour`).

## Behavior

### Trigger (automatic)

On startup, after config has loaded (mirroring the existing `hasSeenTour`
effect in `App.tsx`):

1. Read the running app version via `getVersion()` from `@tauri-apps/api/app`.
2. Read `config.lastSeenVersion` (persisted).
3. Decide:
   - **`lastSeenVersion === null`** → cannot distinguish a fresh install from a
     user upgrading *into* this feature. Silently record
     `lastSeenVersion = current`. **No popup.**
   - **`lastSeenVersion === current`** → up to date. No popup.
   - **`lastSeenVersion !== current`** and there is ≥1 changelog release in the
     range → open the popup showing those releases.
   - Any other case (no releases found in range, version not in changelog) →
     silently record `lastSeenVersion = current`. No popup.
4. When the popup is dismissed, persist `lastSeenVersion = current`.

The "record current version" write also happens when no popup is shown, so the
state converges and a user is never shown the same upgrade twice.

> Consequence (intended): users upgrading *into* this feature do not get a
> popup for the version they are already on — only on the *next* upgrade. This
> avoids a misleading "everything since the beginning" dump.

### Trigger (manual)

**Help → "What's New in AndyMD"** opens the popup for the **current version's**
release only. Manual open does not change `lastSeenVersion`.

### Range semantics

`releasesBetween(all, lastSeen, current)` returns releases `r` where
`lastSeen < r.version <= current`, newest first, compared with semantic
versioning. If `lastSeen` is not a valid version it is treated as "show only
`current`".

## Architecture

Small, isolated units with clear boundaries:

### 1. `src/lib/changelog.ts` — changelog as data (pure)

- `import changelogRaw from '../../CHANGELOG.md?raw'` (Vite bundles the file as
  a string; fully offline).
- `parseChangelog(raw: string): Release[]` — parse Keep-a-Changelog format.
  - `Release = { version: string; date: string | null; sections: Section[] }`
  - `Section = { label: string; items: string[] }` (label = `Added`,
    `Changed`, `Fixed`, …; items = the bullet lines, leading `- ` stripped,
    soft-wrapped continuation lines joined).
  - Skips the `[Unreleased]` block.
- `releasesBetween(all: Release[], lastSeen: string | null, current: string): Release[]`
  — semver-filtered, newest-first.
- `releaseFor(all: Release[], version: string): Release | null` — exact match,
  used by manual open.
- A tiny internal semver compare (`x.y.z` numeric, no pre-release tags needed
  for this project). No new dependency.

**Depends on:** the bundled `CHANGELOG.md` only. **Used by:** `App.tsx` (auto)
and `WhatsNew.tsx` (render).

### 2. `AppConfig.lastSeenVersion` — persisted state

- Add `lastSeenVersion: string | null` to `AppConfig` and `DEFAULT_CONFIG`
  (default `null`) in `src/types.ts`. Persisted by the existing
  `configService`/`configStore`, no new storage.

### 3. `uiStore` flag

- Add `whatsNewOpen: boolean` + `setWhatsNewOpen(open: boolean)` to
  `src/stores/uiStore.ts`, following the existing dialog-flag pattern
  (`versionHistoryOpen`, `collabDialogOpen`, `tourOpen`).

### 4. `src/components/WhatsNew.tsx` — the modal

- Reads which releases to show. To keep the component pure/testable it takes
  the releases via props from a thin wrapper, or reads `whatsNewOpen` + a
  `whatsNewReleases` value set when triggered. **Chosen:** the trigger logic
  computes the releases and stores them on the UI store
  (`whatsNewReleases: Release[]`); the component renders them.
- Styled like `Tour` / `ShareDialog` (scoped CSS, overlay + card, Esc / button
  to close). Header "What's New", then for each release: version + date, then
  each section label with its bullet list.
- Bullets are plain text (changelog markdown like `**bold**`/`` `code` `` is
  rendered as-is or lightly stripped; full markdown rendering is out of scope).
- Close → `setWhatsNewOpen(false)` and (for the automatic path only) persist
  `lastSeenVersion = current`.

### 5. Native menu wiring

- `src-tauri/src/menu.rs`: add a Help submenu item
  `MenuItemBuilder::with_id("show-whats-new", "What's New in AndyMD")` next to
  the existing `show-tour` item.
- `src/hooks/useShortcuts.ts`: add `case 'show-whats-new':` →
  compute the current version's release and `setWhatsNewOpen(true)`.

### 6. `App.tsx`

- Add an effect (next to the `hasSeenTour` one) that runs the automatic trigger
  logic once `configLoaded` is true.
- Render `<WhatsNew />` alongside `<Tour />`.

## Data flow

- **Build:** `CHANGELOG.md` → bundled raw string → `parseChangelog`.
- **Launch (auto):** `configStore.load()` → `App` effect: `getVersion()` +
  `lastSeenVersion` → `releasesBetween` → maybe open modal → on close persist.
- **Manual:** Help menu → Rust emits `menu` event id `show-whats-new` →
  `useShortcuts` case → `releaseFor(current)` → open modal.

## Error handling

All failures degrade to "no popup, startup unaffected":

- `getVersion()` rejects → skip the auto trigger; leave `lastSeenVersion` as-is.
- `parseChangelog` throws or returns `[]` → no popup.
- `current` not present in the changelog → record `lastSeenVersion = current`,
  no popup.
- Persisting `lastSeenVersion` fails → swallow (config save is best-effort, as
  elsewhere).

## Testing

Unit (vitest):

- `parseChangelog` against the real `CHANGELOG.md`: extracts the expected
  versions, dates, section labels, and bullet counts; ignores `[Unreleased]`.
- `releasesBetween`:
  - skipped versions (`0.1.1 → 0.1.4` → three releases, newest first),
  - `lastSeen === current` → `[]`,
  - downgrade (`current < lastSeen`) → `[]`,
  - `lastSeen === null` → only `current`,
  - version not in changelog → `[]`.
- `releaseFor` exact match / miss.

Component (happy-dom):

- `WhatsNew` renders given releases: shows each version, section labels, and
  bullets; hidden when `whatsNewOpen` is false; close button fires the setter.

Decision logic:

- A pure helper for the trigger decision (e.g. `decideWhatsNew({ lastSeen,
  current, releases })` → `{ show: boolean; releases: Release[]; record: string
  | null }`) so the branching is unit-tested without mounting `App`.

## Files

New:

- `src/lib/changelog.ts`
- `src/lib/changelog.test.ts`
- `src/components/WhatsNew.tsx` (+ scoped CSS, e.g. `WhatsNew.css`)
- `src/components/WhatsNew.test.tsx`
- `docs/features-whats-new/spec.md` (this file)

Modified:

- `src/types.ts` — `AppConfig.lastSeenVersion` + default
- `src/stores/uiStore.ts` — `whatsNewOpen` / `whatsNewReleases` + setters
- `src/App.tsx` — auto-trigger effect + `<WhatsNew />`
- `src/hooks/useShortcuts.ts` — `show-whats-new` case
- `src-tauri/src/menu.rs` — Help menu item

## Open questions

None blocking. (Markdown rendering inside bullets is intentionally minimal.)
