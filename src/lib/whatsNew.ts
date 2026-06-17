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
