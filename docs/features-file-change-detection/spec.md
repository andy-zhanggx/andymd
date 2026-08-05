# File change detection, diff & merge

## Goal

When a file that is open in AndyMD is modified on disk by someone else (git
pull, Obsidian, another editor, a sync client), the app must notice, show the
user a diff, and offer to merge — instead of the current behaviour (silent
staleness until save, then a dead-end `window.alert` suggesting Save As).

## What already exists

- `src-tauri/src/watcher.rs` — a `notify` recursive watcher on the workspace
  root, emitting per-file `workspace-changed` events (created / modified /
  removed / renamed). Today only `useWorkspaceWatcher` consumes it, to refresh
  the sidebar tree.
- `read_file` / `write_file` return `mtime`; `documentStore.save()` re-reads
  before writing and throws `EXTERNAL_MODIFIED` when `mtime` advanced and
  content differs. `useShortcuts.saveDocument` turns that into an alert.

## Design

### Detection (live + at save)

- Extend `useWorkspaceWatcher`: on `modified` / `created` / `renamed(to)`
  events whose path matches an **open tab**, debounce per-path (200 ms) and
  call `documentStore.checkExternalChange(path)`.
- `checkExternalChange` re-reads the file and compares the (heading-lenified)
  disk content with the tab's last-known `doc.content`:
  - identical → self-save echo or metadata touch: just refresh `mtime`;
  - differs, tab **clean** → silently reload the tab from disk (Obsidian
    behaviour — nothing to merge, nothing to lose);
  - differs, tab **dirty** → record a conflict
    `{ diskContent, diskMtime }` keyed by path; the Conflict dialog opens for
    the active tab.
- `save()` keeps its mtime guard (covers files outside the watched workspace);
  on conflict it now records the same conflict entry before throwing
  `EXTERNAL_MODIFIED`, so the dialog appears instead of an alert.

### Diff

New pure library `src/lib/diff.ts`:
- `diffLines(a, b)` — LCS-based line diff (common prefix/suffix trimmed; DP
  area capped, falling back to whole-block replace on huge inputs);
- `unifiedRows(a, b, context)` — render-ready rows (`equal | add | del | gap`)
  with n lines of context and `⋯` gaps, used by the dialog.

### Merge

New pure library `src/lib/merge.ts`:
- `merge3(base, mine, theirs)` — line-level diff3: base = last-loaded disk
  snapshot (`doc.content`), mine = editor draft, theirs = new disk content.
  Non-overlapping edits merge cleanly; overlapping regions produce git-style
  conflict markers (`<<<<<<< Your version` / `=======` / `>>>>>>> Disk
  version`) and are counted, so the user resolves leftovers in the editor.

### Prompt (ConflictDialog)

Modal in the style of Version History (`vh-*` → new `cd-*` classes), shown
when the **active** tab's path has a pending conflict:
- unified diff between *your unsaved version* (del/−) and the *disk version*
  (add/+), with a legend;
- actions:
  - **Merge both** (primary) → `resolveConflict(path, 'merge')`: draft becomes
    `merge3(...)`; the doc's `content`/`mtime` adopt the disk version so a
    following save is conflict-free; the tab stays dirty for review;
  - **Keep mine** → write the draft to disk (overwrite);
  - **Use disk version** → discard the draft, load disk content;
  - **✕ / Esc (Decide later)** → dismiss; the next save re-detects and
    re-opens the dialog.

### Editor refresh

The Milkdown editor only rebuilds when `doc.path` changes, so replacing a
draft from outside the editor needs a nudge: add `revision` to `Document`,
bumped whenever content is replaced externally (auto-reload, conflict
resolution). `MarkdownEditor`'s build effect adds `doc?.revision` to its deps,
and its teardown flush skips stashing stale editor content when the revision
it captured is no longer current.

## Out of scope

- Files deleted or renamed-away on disk while open (tab keeps its buffer;
  save re-creates the file).
- Per-hunk interactive merge UI; conflict markers in the editor are the
  resolution surface.
- Watching files opened outside any workspace (save-time detection still
  covers them).

## Testing

- `diff.test.ts` / `merge.test.ts` — pure-function coverage incl. conflict
  counting and context gaps.
- `documentStore.test.ts` — checkExternalChange (echo / clean-reload /
  dirty-conflict), resolveConflict (all three resolutions), save() recording
  the conflict.
- `ConflictDialog.test.tsx` — static render smoke tests.
