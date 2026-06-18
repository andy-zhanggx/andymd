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
  it('shows nothing on a fresh install (lastSeen null, no prior install)', () => {
    expect(
      decideWhatsNew({ all, lastSeen: null, current: '0.2.0', priorInstall: false }),
    ).toEqual({ show: false, releases: [] });
  });
  it('shows the current version once when an existing install upgrades into the feature', () => {
    const d = decideWhatsNew({ all, lastSeen: null, current: '0.2.0', priorInstall: true });
    expect(d.show).toBe(true);
    expect(d.releases.map((r: Release) => r.version)).toEqual(['0.2.0']);
  });
  it('shows nothing for a prior install when current is not in the changelog', () => {
    expect(
      decideWhatsNew({ all, lastSeen: null, current: '9.9.9', priorInstall: true }).show,
    ).toBe(false);
  });
  it('shows the range on an upgrade', () => {
    const d = decideWhatsNew({ all, lastSeen: '0.1.3', current: '0.2.0', priorInstall: true });
    expect(d.show).toBe(true);
    expect(d.releases.map((r: Release) => r.version)).toEqual(['0.2.0']);
  });
  it('shows nothing when already current', () => {
    expect(
      decideWhatsNew({ all, lastSeen: '0.2.0', current: '0.2.0', priorInstall: true }).show,
    ).toBe(false);
  });
  it('shows nothing when current is not in the changelog', () => {
    expect(
      decideWhatsNew({ all, lastSeen: '0.1.3', current: '9.9.9', priorInstall: true }).show,
    ).toBe(false);
  });
});

describe('bundled releases', () => {
  it('parses the real CHANGELOG.md without throwing and includes 0.1.3', () => {
    expect(Array.isArray(releases)).toBe(true);
    expect(releases.some((r) => r.version === '0.1.3')).toBe(true);
  });
});
