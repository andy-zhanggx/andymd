/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to enable online real-time collaboration. See featureFlags.ts. */
  readonly VITE_ENABLE_COLLAB?: string;
}
