# Command palette (⇧⌘P)

## Goal

One searchable list of everything the app can do, each command with its
shortcut, so no feature depends on knowing the menu bar. Roadmap 1.1 #3.

## Design

- **Catalogue** (`src/lib/commands.ts`): data only. Each entry has
  `{ id, title, category, shortcut?, keywords? }`, and its `id` is a
  `handleMenuAction` id. Build flavours filter entries: the App Store build
  has no pandoc exports and no Software Update, and tab commands appear only
  when tabs are on.
- **Filtering**: every query word must appear in the category, title or
  keywords. Results rank by title prefix, then word prefix, then anywhere.
  With an empty query, the five most recent commands lead (kept in
  `localStorage`, a per-viewer convenience).
- **UI** (`src/components/CommandPalette.tsx`): reuses the quick-open dialog
  chrome. The command runs on the next frame, after focus is back in the
  editor, so commands that use the selection see the real one.
- **Entry points**: ⇧⌘P (⌘P still prints) and View → Command Palette….
- **Palette-only commands**: insert a link, an embed or a callout; Show Tags;
  Show Related Notes; Suggest Links; Find Duplicate Notes.
- **Guard**: a test fails if a catalogue id is missing from `handleMenuAction`.
