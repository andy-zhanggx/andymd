import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

/**
 * A short label baked into the build so you can tell *which* build is running —
 * shown as a pill in the title bar (see TitleBar / buildInfo.ts).
 *
 * - **CI / release builds** set `VITE_RELEASE_NAME` (e.g. the git tag) and that
 *   formal name wins. If a CI build forgets to set it we deliberately show
 *   nothing rather than leak a branch name into a release.
 * - **Local builds** fall back to `VITE_FEATURE_NAME` (manual override) or, by
 *   default, the current git branch — so "where am I?" is answered at a glance
 *   when juggling many feature branches.
 */
function buildLabel(): string {
  const release = process.env.VITE_RELEASE_NAME?.trim();
  if (release) return release;
  const isCI = !!(process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI);
  if (isCI) return '';
  const manual = process.env.VITE_FEATURE_NAME?.trim();
  if (manual) return manual;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

// @milkdown/plugin-collab waits on the `EditorViewReady` timer recorded by
// @milkdown/core. If Vite's dep pre-bundling hands the collab plugin a *second*
// copy of @milkdown/core (or its ctx Clock), the timer it waits on isn't the one
// the editor recorded → "Timer EditorViewReady not found". Force a single
// instance of the milkdown core + Yjs/ProseMirror packages everywhere.
const SINGLETON_DEPS = [
  '@milkdown/core',
  '@milkdown/ctx',
  '@milkdown/prose',
  '@milkdown/transformer',
  '@milkdown/utils',
  '@milkdown/kit',
  'yjs',
  'y-protocols',
  'y-prosemirror',
  'prosemirror-state',
  'prosemirror-view',
  'prosemirror-model',
  'prosemirror-transform',
];

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: {
    __BUILD_LABEL__: JSON.stringify(buildLabel()),
  },
  resolve: {
    dedupe: SINGLETON_DEPS,
  },
  optimizeDeps: {
    include: ['@milkdown/plugin-collab', ...SINGLETON_DEPS],
  },
  server: {
    port: 1420,
    strictPort: true,
  },
});
