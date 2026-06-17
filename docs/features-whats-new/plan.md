---
feature: whats-new
type: features
execution_strategy: subagent
reason: Cross-module (lib → store → component → App/hooks/Rust) with sequential type dependencies.
---

# What's New Popup — Implementation Plan

> **For agentic workers:** This plan will be executed via andypower:executing-plans. The execution strategy is declared in the frontmatter above.

**Goal:** Show a modal listing changes since the user's last-run version (from the bundled `CHANGELOG.md`) automatically on upgrade, and on demand from the Help menu.

**Architecture:** All version/changelog logic is pure and unit-tested in `src/lib/changelog.ts`. Thin orchestration glue (`src/lib/whatsNew.ts`) reads the runtime version and drives the UI store. A presentational React component (`WhatsNewView`) is render-tested via `react-dom/server`; a thin container wires it to the store. App startup and a Help menu item trigger it.

**Tech Stack:** TypeScript, React 18, Zustand, Vite (`?raw` import), Tauri v2 (`@tauri-apps/api/app`, Rust menu), Vitest (node + happy-dom).

**Working directory:** the worktree at `.worktrees/whats-new` (branch `feat/whats-new`, off `main`). All paths below are relative to it.

---

## File Structure

- `src/lib/changelog.ts` (new) — types + pure parsing/version logic + the bundled `releases` export. One responsibility: turn the changelog into queryable data and decide what to show.
- `src/lib/whatsNew.ts` (new) — orchestration glue: read runtime version, call the pure decision logic, drive stores. Depends on changelog.ts + stores + Tauri.
- `src/components/WhatsNew.tsx` (new) — `WhatsNewView` (pure presentational) + `WhatsNew` (thin store-connected container).
- `src/lib/changelog.test.ts` (new) — unit tests for the pure logic.
- `src/components/WhatsNew.test.tsx` (new) — render test for `WhatsNewView`.
- `src/stores/uiStore.test.ts` (new) — store action test.
- `src/types.ts` (modify) — add `lastSeenVersion` to `AppConfig` + `DEFAULT_CONFIG`.
- `src/stores/uiStore.ts` (modify) — add `whatsNew*` state/actions.
- `src/App.tsx` (modify) — startup trigger effect + render `<WhatsNew />`.
- `src/hooks/useShortcuts.ts` (modify) — `show-whats-new` menu case.
- `src-tauri/src/menu.rs` (modify) — Help menu item.

---

## Task 1: Changelog data + version logic (pure)

**Files:**
- Create: `src/lib/changelog.ts`
- Test: `src/lib/changelog.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/changelog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseChangelog,
  compareVersions,
  releasesBetween,
  releaseFor,
  decideWhatsNew,
  releases,
  type Release,
} from './changelog';

const SAMPLE = `# Changelog

## [Unreleased]

_Nothing yet._

## [0.2.0] — 2026-07-01

### Added

- A shiny new thing that spans
  two source lines.
- Second add.

### Fixed

- A bug.

## [0.1.3] — 2026-06-17

### Changed

- Tweaked something.
`;

describe('parseChangelog', () => {
  it('parses versions, dates, sections and bullets; skips Unreleased', () => {
    const r = parseChangelog(SAMPLE);
    expect(r.map((x) => x.version)).toEqual(['0.2.0', '0.1.3']);
    expect(r[0].date).toBe('2026-07-01');
    expect(r[0].sections.map((s) => s.label)).toEqual(['Added', 'Fixed']);
    expect(r[0].sections[0].items).toEqual([
      'A shiny new thing that spans two source lines.',
      'Second add.',
    ]);
    expect(r[1].sections[0]).toEqual({ label: 'Changed', items: ['Tweaked something.'] });
  });
});

describe('compareVersions', () => {
  it('orders by numeric segments', () => {
    expect(compareVersions('0.1.3', '0.1.4')).toBe(-1);
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });
});

describe('releasesBetween', () => {
  const all = parseChangelog(SAMPLE);
  it('returns releases newer than lastSeen up to current, newest first', () => {
    expect(releasesBetween(all, '0.1.3', '0.2.0').map((r) => r.version)).toEqual(['0.2.0']);
  });
  it('covers skipped versions', () => {
    const big = parseChangelog(
      '# C\n\n## [0.1.4]\n\n### Added\n\n- d\n\n## [0.1.3]\n\n### Added\n\n- c\n\n## [0.1.2]\n\n### Added\n\n- b\n\n## [0.1.1]\n\n### Added\n\n- a\n',
    );
    expect(releasesBetween(big, '0.1.1', '0.1.4').map((r) => r.version)).toEqual([
      '0.1.4',
      '0.1.3',
      '0.1.2',
    ]);
  });
  it('is empty when lastSeen === current', () => {
    expect(releasesBetween(all, '0.2.0', '0.2.0')).toEqual([]);
  });
  it('is empty on downgrade', () => {
    expect(releasesBetween(all, '0.2.0', '0.1.3')).toEqual([]);
  });
});

describe('releaseFor', () => {
  const all = parseChangelog(SAMPLE);
  it('finds an exact version', () => {
    expect(releaseFor(all, '0.2.0')?.version).toBe('0.2.0');
  });
  it('returns null for an unknown version', () => {
    expect(releaseFor(all, '9.9.9')).toBeNull();
  });
});

describe('decideWhatsNew', () => {
  const all = parseChangelog(SAMPLE);
  it('shows nothing when lastSeen is null (fresh install / first run)', () => {
    expect(decideWhatsNew({ all, lastSeen: null, current: '0.2.0' })).toEqual({
      show: false,
      releases: [],
    });
  });
  it('shows the range on an upgrade', () => {
    const d = decideWhatsNew({ all, lastSeen: '0.1.3', current: '0.2.0' });
    expect(d.show).toBe(true);
    expect(d.releases.map((r: Release) => r.version)).toEqual(['0.2.0']);
  });
  it('shows nothing when already current', () => {
    expect(decideWhatsNew({ all, lastSeen: '0.2.0', current: '0.2.0' }).show).toBe(false);
  });
  it('shows nothing when current is not in the changelog', () => {
    expect(decideWhatsNew({ all, lastSeen: '0.1.3', current: '9.9.9' }).show).toBe(false);
  });
});

describe('bundled releases', () => {
  it('parses the real CHANGELOG.md without throwing and includes 0.1.3', () => {
    expect(Array.isArray(releases)).toBe(true);
    expect(releases.some((r) => r.version === '0.1.3')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/changelog.test.ts`
Expected: FAIL — `Failed to resolve import "./changelog"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/changelog.ts`:

```ts
import changelogRaw from '../../CHANGELOG.md?raw';

export interface Section {
  label: string;
  items: string[];
}

export interface Release {
  version: string;
  date: string | null;
  sections: Section[];
}

const VERSION_RE = /^##\s+\[([^\]]+)\](?:\s*[—-]\s*(.+?))?\s*$/;
const SECTION_RE = /^###\s+(.+?)\s*$/;

/** Parse Keep-a-Changelog markdown into a newest-first list of releases. */
export function parseChangelog(raw: string): Release[] {
  const releases: Release[] = [];
  let current: Release | null = null;
  let section: Section | null = null;

  for (const line of raw.split('\n')) {
    const v = VERSION_RE.exec(line);
    if (v) {
      const version = v[1].trim();
      if (version.toLowerCase() === 'unreleased') {
        current = null;
        section = null;
        continue;
      }
      current = { version, date: v[2]?.trim() ?? null, sections: [] };
      section = null;
      releases.push(current);
      continue;
    }
    if (!current) continue;

    const s = SECTION_RE.exec(line);
    if (s) {
      section = { label: s[1].trim(), items: [] };
      current.sections.push(section);
      continue;
    }
    if (!section) continue;

    const trimmed = line.trim();
    if (trimmed.startsWith('- ')) {
      section.items.push(trimmed.slice(2).trim());
    } else if (trimmed.length > 0 && section.items.length > 0) {
      // Continuation of the previous bullet (soft-wrapped source line).
      section.items[section.items.length - 1] += ' ' + trimmed;
    }
  }
  return releases;
}

/** Compare `x.y.z` version strings numerically. Returns -1 | 0 | 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

/** Releases r with lastSeen < r.version <= current, newest first. */
export function releasesBetween(
  all: Release[],
  lastSeen: string | null,
  current: string,
): Release[] {
  return all
    .filter(
      (r) =>
        compareVersions(r.version, current) <= 0 &&
        (lastSeen === null || compareVersions(r.version, lastSeen) > 0),
    )
    .sort((x, y) => compareVersions(y.version, x.version));
}

/** Exact-version lookup. */
export function releaseFor(all: Release[], version: string): Release | null {
  return all.find((r) => r.version === version) ?? null;
}

/** Decide whether to auto-show the popup, and which releases to show. */
export function decideWhatsNew(args: {
  all: Release[];
  lastSeen: string | null;
  current: string;
}): { show: boolean; releases: Release[] } {
  const { all, lastSeen, current } = args;
  // Null last-seen = fresh install or upgrade-into-this-feature: record only.
  if (lastSeen === null || lastSeen === current) return { show: false, releases: [] };
  // Only show if the running version actually appears in the changelog.
  if (!releaseFor(all, current)) return { show: false, releases: [] };
  const between = releasesBetween(all, lastSeen, current);
  return between.length > 0 ? { show: true, releases: between } : { show: false, releases: [] };
}

/** The parsed bundled changelog. */
export const releases: Release[] = parseChangelog(changelogRaw);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/changelog.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/changelog.ts src/lib/changelog.test.ts
git commit -m "feat(whats-new): changelog parser + version decision logic"
```

---

## Task 2: Persist `lastSeenVersion` in AppConfig

**Files:**
- Modify: `src/types.ts`
- Test: `src/types.ts` is covered by an assertion in `src/stores/uiStore.test.ts` (Task 3) — but add a focused check here first.

- [ ] **Step 1: Write the failing test**

Create `src/lib/config-defaults.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG } from '../types';

describe('DEFAULT_CONFIG', () => {
  it('defaults lastSeenVersion to null', () => {
    expect(DEFAULT_CONFIG.lastSeenVersion).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/config-defaults.test.ts`
Expected: FAIL — `Property 'lastSeenVersion' does not exist` (type error) / `undefined` not `null`.

- [ ] **Step 3: Write the implementation**

In `src/types.ts`, add the field to the `AppConfig` interface, immediately after `displayName: string;`:

```ts
  displayName: string;             // name shown to collaborators (blank = auto)
  lastSeenVersion: string | null;  // app version last shown in "What's New" (null = never)
```

And in `DEFAULT_CONFIG`, after `displayName: '',`:

```ts
  displayName: '',
  lastSeenVersion: null,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/config-defaults.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/lib/config-defaults.test.ts
git commit -m "feat(whats-new): persist lastSeenVersion in AppConfig"
```

---

## Task 3: uiStore What's New state

**Files:**
- Modify: `src/stores/uiStore.ts`
- Test: `src/stores/uiStore.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/stores/uiStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';
import type { Release } from '../lib/changelog';

const release: Release = {
  version: '0.2.0',
  date: '2026-07-01',
  sections: [{ label: 'Added', items: ['Thing'] }],
};

describe('uiStore whats-new', () => {
  beforeEach(() => {
    useUIStore.getState().closeWhatsNew();
  });

  it('opens with the given releases and closes', () => {
    expect(useUIStore.getState().whatsNewOpen).toBe(false);
    useUIStore.getState().openWhatsNew([release]);
    expect(useUIStore.getState().whatsNewOpen).toBe(true);
    expect(useUIStore.getState().whatsNewReleases).toEqual([release]);
    useUIStore.getState().closeWhatsNew();
    expect(useUIStore.getState().whatsNewOpen).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/uiStore.test.ts`
Expected: FAIL — `openWhatsNew is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/stores/uiStore.ts`, add the import at the top (after the `create` import):

```ts
import { create } from 'zustand';
import type { Release } from '../lib/changelog';
```

Add to the `UIState` interface (after the tour block):

```ts
  // "What's New" release-notes popup
  whatsNewOpen: boolean;
  whatsNewReleases: Release[];
  openWhatsNew: (releases: Release[]) => void;
  closeWhatsNew: () => void;
```

Add to the `create(...)` body (after `endTour: ...`):

```ts
  whatsNewOpen: false,
  whatsNewReleases: [],
  openWhatsNew: (releases) => set({ whatsNewOpen: true, whatsNewReleases: releases }),
  closeWhatsNew: () => set({ whatsNewOpen: false }),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/uiStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/stores/uiStore.ts src/stores/uiStore.test.ts
git commit -m "feat(whats-new): uiStore open/close state for the popup"
```

---

## Task 4: WhatsNew component (view + container)

**Files:**
- Create: `src/components/WhatsNew.tsx`
- Create: `src/components/WhatsNew.test.tsx`
- Modify: `src/styles/chrome.css`

- [ ] **Step 1: Write the failing test**

Create `src/components/WhatsNew.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WhatsNewView } from './WhatsNew';
import type { Release } from '../lib/changelog';

const releases: Release[] = [
  {
    version: '0.2.0',
    date: '2026-07-01',
    sections: [
      { label: 'Added', items: ['Cool thing', 'Another thing'] },
      { label: 'Fixed', items: ['A bug'] },
    ],
  },
];

describe('WhatsNewView', () => {
  it('renders each version, section label and bullet', () => {
    const html = renderToStaticMarkup(<WhatsNewView releases={releases} onClose={() => {}} />);
    expect(html).toContain('0.2.0');
    expect(html).toContain('2026-07-01');
    expect(html).toContain('Added');
    expect(html).toContain('Cool thing');
    expect(html).toContain('Another thing');
    expect(html).toContain('Fixed');
    expect(html).toContain('A bug');
  });

  it('renders nothing meaningful for an empty release list but does not throw', () => {
    const html = renderToStaticMarkup(<WhatsNewView releases={[]} onClose={() => {}} />);
    expect(html).toContain('What');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/WhatsNew.test.tsx`
Expected: FAIL — `Failed to resolve import "./WhatsNew"`.

- [ ] **Step 3: Write the implementation**

Create `src/components/WhatsNew.tsx`:

```tsx
import { useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import type { Release } from '../lib/changelog';

/** Pure presentational popup. Render-tested in isolation. */
export function WhatsNewView({
  releases,
  onClose,
}: {
  releases: Release[];
  onClose: () => void;
}) {
  return (
    <div className="whatsnew-backdrop" onClick={onClose}>
      <div
        className="whatsnew-card"
        role="dialog"
        aria-modal="true"
        aria-label="What's New"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="whatsnew-head">
          <h2>What&apos;s New</h2>
          <button className="whatsnew-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="whatsnew-body">
          {releases.map((r) => (
            <section key={r.version} className="whatsnew-release">
              <h3>
                {r.version}
                {r.date ? <span className="whatsnew-date"> · {r.date}</span> : null}
              </h3>
              {r.sections.map((s) => (
                <div key={s.label} className="whatsnew-section">
                  <h4>{s.label}</h4>
                  <ul>
                    {s.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
        </div>
        <footer className="whatsnew-foot">
          <button className="whatsnew-ok" onClick={onClose}>
            Got it
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Store-connected container. */
export function WhatsNew() {
  const open = useUIStore((s) => s.whatsNewOpen);
  const releases = useUIStore((s) => s.whatsNewReleases);
  const close = useUIStore((s) => s.closeWhatsNew);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  if (!open) return null;
  return <WhatsNewView releases={releases} onClose={close} />;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/WhatsNew.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add styles**

Append to `src/styles/chrome.css`:

```css
/* ── What's New popup ────────────────────────────────────────── */
.whatsnew-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.whatsnew-card {
  width: min(520px, 90vw);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--fg-primary);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
  overflow: hidden;
}
.whatsnew-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}
.whatsnew-head h2 {
  margin: 0;
  font-size: 1.1rem;
}
.whatsnew-close {
  border: none;
  background: none;
  color: var(--fg-secondary);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.whatsnew-body {
  padding: 8px 20px 4px;
  overflow-y: auto;
}
.whatsnew-release h3 {
  margin: 14px 0 4px;
  font-size: 1rem;
}
.whatsnew-date {
  color: var(--fg-muted);
  font-weight: 400;
  font-size: 0.85em;
}
.whatsnew-section h4 {
  margin: 10px 0 2px;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--fg-secondary);
}
.whatsnew-section ul {
  margin: 0 0 6px;
  padding-left: 20px;
}
.whatsnew-section li {
  margin: 2px 0;
  font-size: 0.92rem;
}
.whatsnew-foot {
  padding: 12px 20px 16px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--border);
}
.whatsnew-ok {
  padding: 6px 16px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
  font-size: 0.9rem;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/WhatsNew.tsx src/components/WhatsNew.test.tsx src/styles/chrome.css
git commit -m "feat(whats-new): popup component and styles"
```

---

## Task 5: Orchestration glue (`whatsNew.ts`)

**Files:**
- Create: `src/lib/whatsNew.ts`

This module is thin Tauri/store glue; its decision logic is already tested in Task 1. No new test (verified via build + manual run in Task 7).

- [ ] **Step 1: Write the implementation**

Create `src/lib/whatsNew.ts`:

```ts
import { getVersion } from '@tauri-apps/api/app';
import { releases, decideWhatsNew, releaseFor } from './changelog';
import { useConfigStore } from '../stores/configStore';
import { useUIStore } from '../stores/uiStore';

/**
 * Startup check: if the running version advanced past the last-seen version,
 * open the popup with the intervening releases. Always records the running
 * version as last-seen so the same upgrade is never shown twice (fresh installs
 * and upgrades-into-this-feature record silently, no popup).
 */
export async function runWhatsNewCheck(): Promise<void> {
  let current: string;
  try {
    current = await getVersion();
  } catch {
    return; // not in a Tauri context / version unavailable — skip silently
  }
  const config = useConfigStore.getState();
  const lastSeen = config.config.lastSeenVersion;
  const { show, releases: shown } = decideWhatsNew({ all: releases, lastSeen, current });
  if (lastSeen !== current) void config.update({ lastSeenVersion: current });
  if (show) useUIStore.getState().openWhatsNew(shown);
}

/** Manual (Help menu): show the current version's notes, if present. */
export async function openWhatsNewForCurrent(): Promise<void> {
  let current: string;
  try {
    current = await getVersion();
  } catch {
    return;
  }
  const release = releaseFor(releases, current);
  useUIStore.getState().openWhatsNew(release ? [release] : releases.slice(0, 1));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0 (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/whatsNew.ts
git commit -m "feat(whats-new): startup + manual orchestration helpers"
```

---

## Task 6: Wire startup trigger and render the popup

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Add imports**

In `src/App.tsx`, add after the existing `import { Tour } from './components/Tour';` line:

```ts
import { WhatsNew } from './components/WhatsNew';
import { runWhatsNewCheck } from './lib/whatsNew';
```

- [ ] **Step 2: Add the startup effect**

In `App()`, immediately after the existing first-run tour effect (the `useEffect` that calls `startTour()`), add:

```ts
  // After config loads, show "What's New" if the app version advanced.
  useEffect(() => {
    if (configLoaded) void runWhatsNewCheck();
  }, [configLoaded]);
```

- [ ] **Step 3: Render the popup**

In the returned JSX, add `<WhatsNew />` immediately after `<Tour />`:

```tsx
      <Tour />
      <WhatsNew />
    </div>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "feat(whats-new): auto-show on upgrade at startup"
```

---

## Task 7: Help menu item + manual reopen

**Files:**
- Modify: `src-tauri/src/menu.rs`
- Modify: `src/hooks/useShortcuts.ts`

- [ ] **Step 1: Add the native menu item**

In `src-tauri/src/menu.rs`, change the `help_menu` builder to add the item before `.build()`:

```rust
    let help_menu = SubmenuBuilder::new(app, "Help")
        .item(&MenuItemBuilder::with_id("show-tour", "Welcome Tour").build(app)?)
        .item(&MenuItemBuilder::with_id("show-whats-new", "What's New in AndyMD").build(app)?)
        .build()?;
```

- [ ] **Step 2: Handle the menu event in the frontend**

In `src/hooks/useShortcuts.ts`, add the import near the other lib imports (after `import { buildExportHtml } from '../lib/exportHtml';`):

```ts
import { openWhatsNewForCurrent } from '../lib/whatsNew';
```

Then add a case next to `case 'show-tour':`:

```ts
    case 'show-tour':
      useUIStore.getState().startTour();
      break;
    case 'show-whats-new':
      void openWhatsNewForCurrent();
      break;
```

(If `show-tour` has no explicit `break` because it falls through, keep the existing structure and insert the `show-whats-new` case immediately after it with its own `break`.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/menu.rs src/hooks/useShortcuts.ts
git commit -m "feat(whats-new): Help menu item to reopen the popup"
```

---

## Task 8: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all tests pass, including the new `changelog`, `uiStore`, `WhatsNew`, and `config-defaults` tests.

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: exit 0.

- [ ] **Step 3: Manual smoke (optional, real app)**

If a dev environment is available, set `lastSeenVersion` to an older value in the saved config (or temporarily edit `DEFAULT_CONFIG`), launch the app, and confirm the popup appears with the 0.1.3 notes; confirm **Help → What's New in AndyMD** reopens it. Revert any temporary edit.

- [ ] **Step 4: Final commit (if anything was adjusted)**

```bash
git add -A
git commit -m "test(whats-new): verify full suite green"
```

---

## Self-Review

**Spec coverage:**
- Notes from bundled CHANGELOG.md → Task 1 (`?raw` import + `parseChangelog`). ✓
- Auto-show on upgrade, silent-record on null/equal → Task 1 (`decideWhatsNew`) + Task 5/6 (`runWhatsNewCheck`). ✓
- Cover skipped versions → Task 1 (`releasesBetween` test). ✓
- Manual Help reopen showing current version → Task 5 (`openWhatsNewForCurrent`) + Task 7. ✓
- Persisted `lastSeenVersion` → Task 2. ✓
- uiStore flag → Task 3. ✓
- Modal styled like existing dialogs → Task 4 (chrome.css). ✓
- Error-safe (no popup on failure, never blocks startup) → `runWhatsNewCheck`/`openWhatsNewForCurrent` try/catch; `decideWhatsNew` guards unknown current. ✓
- Tests for parser, ranges, decision, component → Tasks 1, 3, 4. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `Release`/`Section` defined in Task 1 and reused (imports) in Tasks 3, 4, 5. Functions `parseChangelog`, `releasesBetween`, `releaseFor`, `decideWhatsNew`, `releases` used consistently. Store actions `openWhatsNew`/`closeWhatsNew` and state `whatsNewOpen`/`whatsNewReleases` named identically across Tasks 3, 4, 5. Menu id `show-whats-new` matches between Task 7's Rust and TS.

**Scope:** single feature, no decomposition needed.
