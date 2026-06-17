var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// @milkdown/plugin-collab waits on the `EditorViewReady` timer recorded by
// @milkdown/core. If Vite's dep pre-bundling hands the collab plugin a *second*
// copy of @milkdown/core (or its ctx Clock), the timer it waits on isn't the one
// the editor recorded → "Timer EditorViewReady not found". Force a single
// instance of the milkdown core + Yjs/ProseMirror packages everywhere.
var SINGLETON_DEPS = [
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
    resolve: {
        dedupe: SINGLETON_DEPS,
    },
    optimizeDeps: {
        include: __spreadArray(['@milkdown/plugin-collab'], SINGLETON_DEPS, true),
    },
    server: {
        port: 1420,
        strictPort: true,
    },
});
