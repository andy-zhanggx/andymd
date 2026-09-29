# `[[` autocomplete

## Goal

Typing `[[` offers the vault's files. Choosing one inserts a wikilink, and
`[[note#` lists that note's headings. Roadmap 1.1 #2.

## Design

- **Pure logic** (`src/lib/linkSuggest.ts`):
  - `detectTrigger` finds an unfinished `[[query` or `![[query` before the
    caret. A `|` or `]` ends it.
  - `rankFiles` scores an exact name, then a name prefix, a name substring, a
    path substring, and finally a subsequence. Notes rank above attachments.
  - `linkTextFor` returns the bare note name when it is unique in the vault
    and the vault path otherwise, as Obsidian does. Attachments keep their
    extension.
  - A query with no exact match also offers a "New link" to a note that does
    not exist yet.
- **Headings**: in `[[note#head` the note part is resolved. The current note's
  headings come from the live buffer; other notes' headings are read and
  cached for 10 seconds. `[[#` lists the current note's headings.
- **Plugin** (`src/components/Editor/linkSuggest.ts`): recomputes the popup on
  every view update and publishes it to `linkSuggestStore`. The React
  `LinkSuggest` popup renders from that store. Keys are caught in the capture
  phase on the editor's parent element, so ↑/↓/Enter/Tab/Esc beat the presets'
  keymaps. Accepting a suggestion replaces `[[query` and any auto-paired `]]`
  with a `wikilink` or `wiki_embed` node. Esc dismisses the popup until the
  trigger changes.
- The palette commands "Link to Note…" and "Embed Note or Image…" type the
  brackets and let the popup take over.

## Tests

`linkSuggest.test.ts` covers trigger detection, ranking, link text and
heading targets. `linkSuggest.integration.test.ts` covers file choice over
auto-paired brackets, current-note and other-note headings, and dismissal.
