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
