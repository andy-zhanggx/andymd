/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to enable online real-time collaboration. See featureFlags.ts. */
  readonly VITE_ENABLE_COLLAB?: string;
  /** Set to "false" to disable the multi-tab experience (on by default). See featureFlags.ts. */
  readonly VITE_ENABLE_TABS?: string;
}

/**
 * Build label baked in by vite.config.ts: the release name on CI builds, the git
 * branch (or VITE_FEATURE_NAME) on local builds, '' when unknown. See buildInfo.ts.
 */
declare const __BUILD_LABEL__: string;
