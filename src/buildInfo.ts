/**
 * Build-time identity, baked in by vite.config.ts via `define`.
 *
 * `BUILD_LABEL` is the formal release name on CI/release builds, or the current
 * git branch (or VITE_FEATURE_NAME) on local builds, and '' when unknown. The
 * title bar renders it as a pill so you can see which build is running. See the
 * "Build labels" section in CLAUDE.md.
 */
export const BUILD_LABEL: string =
  typeof __BUILD_LABEL__ === 'string' ? __BUILD_LABEL__ : '';
