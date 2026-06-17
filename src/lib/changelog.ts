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
