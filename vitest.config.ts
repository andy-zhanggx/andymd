import { defineConfig } from 'vitest/config';

// ProseMirror breaks if more than one copy of these packages is loaded:
// decoration/selection `instanceof` checks fail across duplicate module
// instances (DecorationGroup.from then yields an undefined member). Force a
// single instance for the test runner.
export default defineConfig({
  resolve: {
    dedupe: ['prosemirror-state', 'prosemirror-view', 'prosemirror-model', 'prosemirror-transform'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    globals: true,
    // Inline Milkdown/ProseMirror so vitest loads ONE module instance of each.
    // Externalized deps get duplicate ESM/CJS records, which breaks
    // ProseMirror's cross-package instanceof checks (decoration grouping).
    server: {
      deps: {
        // Inline the milkdown PM proxy so its `export * from 'prosemirror-*'`
        // is transformed in the same realm as our code → one DecorationSet
        // class shared with the editor view.
        inline: [/@milkdown\/prose/, /^prosemirror-/],
      },
    },
  },
});
