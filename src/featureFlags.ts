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

/**
 * `MULTI_TABS` gates the multi-document tab experience — the tab strip, the
 * "Open in New Tab / This Window" link context menu, ⌘T / Ctrl+Tab, and tab
 * session restore. It is **off by default**: with the flag off the editor
 * behaves as a single-document workspace exactly as before (a link click opens
 * in place, no tab bar). Not ready to ship yet.
 *
 * Enable for development:
 *
 *     VITE_ENABLE_TABS=true pnpm dev
 *
 * The literal-string compare lets Vite fold the constant and tree-shake the
 * gated branches out of a production build when it is false.
 */
export const MULTI_TABS = import.meta.env.VITE_ENABLE_TABS === 'true';
