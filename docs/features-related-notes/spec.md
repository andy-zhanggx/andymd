# On-device intelligence: related notes, link suggestions, duplicates

## Goal

Make the semantic index useful while writing, not only through the `≈`
search toggle. Roadmap 1.2 #1–#4. Everything runs on the Mac. Only the link
suggestions embed any new text, one paragraph at a time. Related notes and
duplicates reuse vectors already in the index.

## Rust (`src-tauri/src/semantic/`)

- `SemanticIndex::related(path, line?, limit)` builds a query vector from
  the note's **mean vector** (its chunk vectors averaged and normalised).
  With `line` given, it uses the vector of the chunk containing that line
  (**section mode**). Every other note is scored by its best-matching chunk,
  one hit per note, and `path` itself is excluded.
- `SemanticIndex::duplicates(threshold, limit)` compares the mean vectors of
  all note pairs and returns the pairs above the threshold, best first. It
  is quadratic, but only dot products over vectors already in memory.
  `semantic_duplicates` runs it on a blocking worker.
- Commands: `semantic_related(root, path, line?, limit?)` and
  `semantic_duplicates(root, threshold?, limit?)`. Both answer with only the
  status until the index is ready.

## Frontend

- **Related tab** (`RelatedPanel.tsx`) has a "This note / This section" switch,
  link suggestions and the related-notes list. Clicking a note opens it at
  the matching heading (⌘-click opens it in a new tab). When semantic
  search is off the tab shows the usual consent panel; while indexing it
  shows progress.
- **Auto-refresh** (`useRelatedAutoRefresh`, mounted in App): related notes
  follow the open note and are refreshed after a save, since saving
  re-embeds the note. In section mode they also follow the caret's section:
  the heading index of the caret maps to a line through `sectionLine`.
  Link suggestions follow the caret paragraph. Everything is debounced by
  700 ms.
- **Link suggestions**: the caret paragraph (30 characters or more) goes
  through `semantic_search`. `pickSuggestions` keeps one hit per note
  scoring ≥ 0.6, at most 3. It skips the current note, notes already linked
  (wikilinks, embeds and Markdown links resolved against the vault) and
  suggestions dismissed for this note. Dismissals are kept in `localStorage`.
  **Link** inserts `[[name]]` at the caret. A status-bar hint appears when
  suggestions exist and the Related tab isn't showing.
- **Find Duplicate Notes…** (palette, View menu, and a button in the Related
  tab) opens a dialog with three levels: near-identical 0.96, very similar
  0.92, similar 0.88. **Open both** opens the pair side by side in tabs.

## Tests

- Rust: related ranking, self-exclusion, section mode and limits; duplicates
  finds only the copy.
- TS: `related.test.ts` (sections, suggestion filtering),
  `relatedStore.test.ts` (calls, thresholds, dismissal persistence), and
  render tests for the panel and the dialog.

## Calibration note

The 0.6 suggestion threshold and the duplicate levels are first guesses for
`bge-small-zh-v1.5`. They live as constants (`SUGGEST_THRESHOLD`, `LEVELS`)
so they can be tuned against real vaults.
