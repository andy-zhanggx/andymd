# File-tree search with a pre-built index

## Goal

Add a search box to the **Files** sidebar. Typing filters the document tree down
to the notes whose **name or content** matches, with their parent folders
auto-expanded, so a vault of thousands of notes can be narrowed in place without
leaving the tree. Results must feel instant, so the vault is **indexed ahead of
time** (when the workspace opens) and the index is kept fresh by the existing
file watcher rather than re-scanning the disk on every keystroke.

## What already exists

- `src/components/Sidebar/FileTree.tsx` — a `react-arborist` tree over
  `workspace.tree` (`FileNode`), all folders collapsed by default.
- `src-tauri/src/commands/search_cmd.rs` — `search_workspace(root, query)`,
  the ⇧⌘F vault search. It walks the disk and reads every file per query.
- `src-tauri/src/watcher.rs` — a `notify` recursive watcher on the workspace
  root that emits `workspace-changed` (created / modified / removed).
- `src/lib/quickOpen.ts` — in-memory filename filter for the ⌘O dialog.
- `src/lib/globalSearch.ts` — `highlightSegments()` for match highlighting.

## Approaches considered

1. **Frontend-only filename filter** (reuse `flattenFiles` + `filterFiles`).
   Trivial, but only matches names. No index needed, so it does not meet the
   "index ahead of time" requirement and cannot find notes by their content.
2. **Rust in-memory index, built at workspace open, maintained by the watcher**
   (chosen). One `HashMap<path, {relPath, nameLower, contentLower}>` per open
   workspace. Queries are a substring scan over in-memory strings — fast enough
   for vaults up to tens of thousands of notes and zero disk I/O per keystroke.
3. **Persistent on-disk index (tantivy / SQLite FTS).** Survives restarts and
   scales to huge corpora, but adds a heavy dependency, an on-disk artifact
   inside or beside the vault, and stale-index reconciliation logic. Overkill
   for the target vault sizes; option 2 can grow into this later.

## Design

### Rust: `search_index.rs`

```
pub struct SearchIndexState { inner: Mutex<Option<SearchIndex>> }
struct SearchIndex { root: PathBuf, ready: bool, docs: HashMap<PathBuf, IndexedDoc> }
struct IndexedDoc { rel_path: String, name_lower: String, content_lower: String }
```

- **Build:** `SearchIndexState::rebuild(app, root)` marks the state as
  `{root, ready: false, docs: {}}`, then spawns a thread that walks the vault
  with the same traversal rules as `search_workspace` (`.md`/`.markdown`/`.txt`,
  skip dotted entries), reads each file, lowercases it, and swaps the finished
  map in under the lock with `ready: true`. When done it emits
  `search-index-ready { root }` so the frontend can re-run a query that was
  typed while indexing. A build for a root that no longer matches the state's
  root (user switched workspaces mid-build) is discarded.
- **Trigger:** `open_workspace` (already called by `workspaceStore.open`) calls
  `rebuild` right after starting the watcher. The index is therefore ready
  before the user reaches for the search box.
- **Incremental updates:** the watcher callback already holds an `AppHandle`.
  After emitting `workspace-changed` it calls `SearchIndexState::apply(root, event)`:
  - created / modified → if the path is a searchable file under the root,
    re-read it and upsert the entry (a read failure removes the entry);
  - removed → drop the entry, or every entry under the path if it was a folder.
  Renames arrive from `notify` as remove + create, which the above covers.
- **Query:** `search_index(root, query) -> IndexSearchResults`

  ```
  { ready: bool, files: [{ path, relPath, nameHit: bool, contentHit: bool }], truncated: bool }
  ```

  Case-insensitive substring; a file matches when the trimmed query occurs in
  its relative path or its content. Results are sorted by `relPath`, capped at
  `MAX_HITS = 2000` (sets `truncated`). If the state's root differs from the
  requested root or is not yet ready, returns `ready: false` (and kicks off a
  rebuild when the root differs), so the UI shows "Indexing…" instead of
  blocking.
- Unit tests (tempdir): builds and finds by name and by content; skips dotted
  dirs and non-text files; `apply` upserts on modify, removes on delete
  (file and folder); empty query returns nothing.

### Frontend

- `fsService.searchIndex(root, query)` + `onSearchIndexReady(cb)`.
- `src/lib/treeFilter.ts` (pure, tested):
  - `pruneTree(root, keep: Set<string>) -> FileNode` — returns a copy of the
    tree containing only files in `keep` and the folders needed to reach them
    (folders keep their original order; empty folders are dropped).
  - `countFiles(node)` helper for the "n matches" hint.
- `TreeSearch.tsx` (new, in `Sidebar/`): a compact input row under the
  workspace switcher with a clear (×) button. Owns `query`, debounces 150 ms,
  calls `fsService.searchIndex`, guards against stale responses with a
  generation counter, and re-runs the current query when `search-index-ready`
  fires. `Esc` clears the query and blurs. Reports `{ query, hits, status }`
  up to `Sidebar` via a callback; status is `idle | indexing | searching | done`.
- `Sidebar.tsx`: renders `TreeSearch` between the switcher and the tree
  (subtracting its height from the tree's measured height), and passes a
  `filter` to `FileTree` when the query is non-empty.
- `FileTree.tsx`: with a filter, renders `pruneTree(root, keep)` with
  `openByDefault` and a `key` tied to the query so folders expand to reveal
  hits; file names get `<mark>` highlights via `highlightSegments`; a file that
  matched only by content shows a small muted "text" glyph so the user knows
  why it is listed. When the filtered tree is empty, the tree area shows
  "No matches" (or "Indexing…" while the index is building).
- Hint line under the input while filtering: `n files` (+ `+` when
  truncated) so the user knows how much was cut.

### Error handling

- Index build errors (unreadable file) skip that file; the build never fails
  as a whole.
- A failed `search_index` IPC call logs a warning and shows "No matches"; the
  tree is never left in a broken state, and clearing the query always
  restores the full tree.
- Workspace close or switch resets the search state.

### Testing

- Rust unit tests for the index (see above); `cargo test` in `src-tauri`.
- Vitest for `treeFilter.ts` and a static-render test of `FileTree` with a
  filter (`renderToStaticMarkup`), checking the pruned rows and the `<mark>`.
- Manual: debug `.app` against the andykb vault; type a term, confirm the
  tree narrows and folders expand, edit a note in another editor and confirm
  the index picks up the change.

## Build sequence

1. Rust index module + tests, wire `manage`, `open_workspace`, watcher, command.
2. `fsService` bindings + `treeFilter.ts` with tests.
3. `TreeSearch` + `Sidebar` + `FileTree` changes + CSS.
4. README / CHANGELOG entries.
