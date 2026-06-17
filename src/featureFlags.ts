/**
 * Build-time feature flags.
 *
 * `ONLINE_COLLAB` gates every *online* capability of the real-time
 * collaboration feature — the share/join dialog, the presence bar, and the
 * Hocuspocus WebSocket connection itself. It is **off by default** so the app
 * ships as a clean, fully-offline Markdown editor: all local editing and
 * rendering features (math, HTML tables, fenced code, …) stay on regardless.
 *
 * The collaboration code remains in the bundle but inert. To re-enable online
 * collaboration for development, build/run with the env var set:
 *
 *     VITE_ENABLE_COLLAB=true pnpm dev
 *
 * Comparing against a literal string lets Vite statically fold this constant and
 * tree-shake the gated branches out of a production build when it is false.
 */
export const ONLINE_COLLAB = import.meta.env.VITE_ENABLE_COLLAB === 'true';
