# #tags

## Goal

Recognise Obsidian tags, list them, and filter the vault by tag. Roadmap 1.1
stretch.

## Bugs this also fixes

- A `#tag` at the start of a line was saved as `\#tag` by the serializer.
  Obsidian no longer reads that as a tag.
- `lenifyHeadings` turned every `#word` line into an H1, including tag lines
  (`#project #idea` became a heading) and `#include <x>` inside fenced code.
  Both were saved back. It now skips fenced code, frontmatter, and a single
  `#` followed by a tag character. `##标题`-style lenient headings (two or
  more `#`) are unchanged.

## Tag rule

A tag is `#` at a word boundary followed by letters of any script, digits,
`_`, `-` or `/` (nested tags). It needs at least one non-digit, so `#2024` is
not a tag. Tags are never taken from code, links, headings or math. The
Rust side (`extract_tags`) and the editor (`tag.ts`) implement the same rule.

## Design

- **Editor**: tags become inline `tag` atom nodes, written back verbatim, and
  render as chips. Typing `#word ` creates one. Clicking a tag calls
  `showTag`, which switches the sidebar to Files and filters the tree to
  `#tag`.
- **Index** (`search_index.rs`): every indexed note also stores its tags,
  inline plus frontmatter `tags:` / `tag:` in list or inline form. The file
  watcher keeps them fresh.
  - `list_tags(root)` returns each tag and the number of notes carrying it,
    most used first.
  - A tree-filter query `#tag` matches by tag, nested tags included (`#a`
    finds `#a/b`), instead of by substring, so `#ai` does not match `#air`.
- **Sidebar**: a new *Tags* tab with a filter box. It refreshes on
  `search-index-ready` and on file-watcher events. Show Tags is available
  in the palette and in the View menu.

## Tests

- Rust: `extract_tags` (inline, frontmatter, code, headings, trailing `/`)
  and tag queries / `list_tags`.
- TS: `tag.integration.test.ts` (round-trips, boundaries, the input rule,
  click) and the new `lenifyHeadings` cases.
