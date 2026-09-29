# Callouts

## Goal

Render Obsidian callouts (`> [!note] Title`) as callouts, not as plain
blockquotes, and write them back byte-for-byte. Roadmap 1.1 #1.

## The bug this also fixes

CommonMark parses a callout as a blockquote whose text starts with `[!note]`.
The Markdown serializer escapes that bracket, so opening and saving a note
used to rewrite `> [!note]` as `> \[!note]`. That breaks the callout in Obsidian.

## Design

- **Parse** (`src/components/Editor/callout.ts`, `remarkCallout`): an mdast
  transform turns every blockquote whose first text matches
  `^\[!(type)\]([+-]?)` into a `callout` node, recursively, so nested
  callouts work too. The rest of the header line becomes a `calloutTitle`
  node, which keeps its inline formatting. The remaining text and blocks
  become the body.
- **Schema**: `callout` (`content: 'callout_title block*'`, attrs `kind`, `fold`,
  `gap`) and `callout_title` (`inline*`).
- **Serialize**: a to-markdown handler for `callout`. It writes
  `[!kind]fold title`, then the body through `containerFlow`, and prefixes
  every line with `> ` the same way the blockquote handler does. The
  header is written raw, so it is never escaped.
- **Round-trip details**: `kind` keeps its spelling (`NOTE` stays `NOTE`).
  `gap` records whether a blank `>` line separates the header from the body
  (read from mdast positions). Empty titles stay empty.
- **Folding**: `+` and `-` callouts get a chevron (NodeView). Collapsing is
  view state that starts from the source and never writes back, as in
  Obsidian's reading view.
- **Authoring**: typing `[!tip] ` at the start of a quote converts the quote.
  The palette command "Insert → Callout" inserts one, and Enter in the title
  moves the caret to the body.
- **Styling**: each kind has an accent colour and glyph (note, tip, warning,
  danger, …). An empty title shows the kind name. HTML export carries its
  own copy of the rules.

## Tests

`callout.integration.test.ts` covers lossless round-trips for title, folding,
nested callouts, lists, and a blank-line gap. It also checks that plain quotes
stay untouched, and covers the attributes, the collapsed render, the input
rule, and `insertCallout` plus Enter.

## Out of scope

Custom callout icons from CSS snippets, and a metadata syntax
(`[!note|meta]`), which is parsed into `kind` as-is.
