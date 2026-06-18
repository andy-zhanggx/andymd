# What's New — popup on upgrades only

## Problem

The automatic "What's New" popup (`runWhatsNewCheck` on startup) never fires on the
first launch after this feature shipped, because every existing user had
`lastSeenVersion === null` at that point. `decideWhatsNew` treats `null` as
"fresh install or upgrade-into-feature" and stays silent, recording the version.
As a result the popup is only reachable through the Help menu until the *next*
upgrade. Users perceive the auto-popup as broken.

## Goal

Show the What's New popup automatically, **once**, when an existing install first
runs a newer version — including the launch that introduces this behavior. Keep
genuine fresh installs silent (they get the onboarding Tour instead).

## Signal: fresh install vs. prior install

When `lastSeenVersion` is `null` we disambiguate using the already-persisted
`hasSeenTour` flag:

- `hasSeenTour === false` → fresh install → stay silent.
- `hasSeenTour === true` → the user has used the app before → existing install
  upgrading into the feature → show the current version's notes once.

No new persisted state is introduced. This also prevents stacking the What's New
popup on top of the first-run Tour.

## Changes

### `src/lib/changelog.ts` — `decideWhatsNew`

Add a `priorInstall: boolean` argument. The decision becomes:

```ts
export function decideWhatsNew(args: {
  all: Release[]; lastSeen: string | null; current: string; priorInstall: boolean;
}): { show: boolean; releases: Release[] } {
  const { all, lastSeen, current, priorInstall } = args;
  if (lastSeen === current) return { show: false, releases: [] };
  const currentRelease = releaseFor(all, current);
  if (!currentRelease) return { show: false, releases: [] }; // unknown version → never
  if (lastSeen === null) {
    return priorInstall
      ? { show: true, releases: [currentRelease] }
      : { show: false, releases: [] };
  }
  const between = releasesBetween(all, lastSeen, current);
  return between.length > 0 ? { show: true, releases: between } : { show: false, releases: [] };
}
```

`changelog.ts` stays decoupled from the Tour feature — it takes a plain boolean;
the caller decides what feeds it.

### `src/lib/whatsNew.ts` — `runWhatsNewCheck`

Pass `priorInstall: config.config.hasSeenTour` into `decideWhatsNew`. The existing
"always record `lastSeenVersion = current`" line is unchanged, so the popup still
shows at most once per version.

## Behavior matrix

| Scenario | lastSeen | hasSeenTour | Result |
|---|---|---|---|
| Fresh install | null | false | Tour shows; What's New silent; version recorded |
| Existing user, first launch after this ships | null | true | What's New pops once (current notes); version recorded |
| Normal upgrade | 0.1.3 | true | What's New pops once (releases between); version recorded |
| Same version relaunch | 0.1.3 (==current) | true | silent |
| Unknown/dev version | any | any | silent |

## Tests

Update `src/lib/changelog.test.ts` `decideWhatsNew` cases to pass `priorInstall`,
and add:
- `lastSeen=null, priorInstall=true`, current in changelog → `show: true`, current release.
- `lastSeen=null, priorInstall=false` → `show: false`.

No UI changes; `WhatsNew.tsx` and the popup styles are untouched.
