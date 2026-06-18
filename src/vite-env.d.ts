/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to enable online real-time collaboration. See featureFlags.ts. */
  readonly VITE_ENABLE_COLLAB?: string;
}

/**
 * Build label baked in by vite.config.ts: the release name on CI builds, the git
 * branch (or VITE_FEATURE_NAME) on local builds, '' when unknown. See buildInfo.ts.
 */
declare const __BUILD_LABEL__: string;
