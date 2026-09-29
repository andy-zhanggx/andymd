# Roadmap

What we plan to ship next and in which release. The reasoning is in
[THOUGHTS.md](THOUGHTS.md). Shipped work moves to [CHANGELOG.md](../CHANGELOG.md).
Each item gets its own `docs/features-<name>/spec.md` before implementation
starts.

_Last updated: 2026-09-28 — 1.1 and 1.2 are implemented on `claude/gifted-ride-ga2fb3` and waiting to ship (see `[Unreleased]` in the changelog)._

Status legend: ⬜ planned · 🟡 in progress · ✅ shipped

---

## 1.1 — Vault completeness

**Theme:** close the Obsidian-compatibility gaps and make the features we
already have discoverable. All the items are small, and each one removes a
reason for an Obsidian user to bounce.

Already in `[Unreleased]` and shipping with 1.1:

- ✅ File-tree search with a pre-built index
- ✅ Semantic search, on-device (`bge-small-zh-v1.5`)

Planned:

| # | Feature | Notes |
|---|---|---|
| 1 | ✅ **Callouts** | `> [!note]`, `> [!warning]`, `> [!tip]` etc., including a custom title (`> [!note] Title`) and folding (`[!note]-` / `[!note]+`). Styled in the editor and in HTML export. The source must round-trip unchanged. |
| 2 | ✅ **`[[` autocomplete** | Typing `[[` opens a fuzzy file picker that reuses `lib/quickOpen` and the file-tree index. Also completes `[[note#heading]]` and `[[note\|alias]]`. |
| 3 | ✅ **Command palette (`⇧⌘P`)** | Fuzzy list of every menu action and view mode, showing each one's shortcut. Becomes the single entry point for future commands. |
| 4 | ✅ **Update links on rename/move** | When `rename_path` succeeds, find the wikilinks and relative Markdown links that point at the old path (the backlinks index already knows them), show a confirmation listing the affected files, then rewrite them. |

Stretch (both made it into 1.1):

- ✅ **`![[embeds]]`**: embedded images first (`![[pic.png]]`, `![[pic.png|300]]`), then read-only note transclusion (`![[note]]`, `![[note#heading]]`).
- ✅ **`#tags`**: recognized inline and in frontmatter `tags:`, with a tag list in the sidebar that you click to filter the tree.

Exit criteria: an existing Obsidian vault opens with no visibly broken syntax
in the common cases, and renaming a note never leaves a dead link behind.

Specs: [callouts](features-callouts/spec.md) ·
[autocomplete](features-wikilink-autocomplete/spec.md) ·
[command palette](features-command-palette/spec.md) ·
[relink on rename](features-relink-on-rename/spec.md) ·
[embeds](features-embeds/spec.md) · [tags](features-tags/spec.md)

Found while building it, and fixed: callouts, embeds, line-leading tags and
typed `[[links]]` were being saved escaped; lenient headings rewrote
`#include` lines in code blocks and Obsidian tag lines; `[[note#Heading]]`
showed as dead; an open tab kept its old path after a rename.

---

## 1.2 — On-device intelligence

**Theme:** turn semantic search from one toggle into something that works
alongside you while you write. Everything reads from the existing semantic
index, and nothing leaves the Mac.

| # | Feature | Notes |
|---|---|---|
| 1 | ✅ **Related notes panel** | A sidebar panel that lists the notes closest in meaning to the current note (or current section), each with a snippet and a similarity bar, and clicking one opens it. Needs a new "search by note/chunk vector" command next to `semantic_search`, which currently takes only a text query. It updates when you switch notes and, debounced, after you save. |
| 2 | ✅ **Link suggestions** | While you write, offer "this paragraph looks related to [[X]]" as an unobtrusive hint. One click inserts the link. It skips notes that are already linked, and the user can dismiss a suggestion for good. |
| 3 | ✅ **Near-duplicate finder** | A vault-level report of note pairs above a similarity threshold, to help clean up large vaults. You can open both notes side by side in tabs. |
| 4 | ✅ **Command-palette hooks** | "Find related", "Suggest links for this note" and "Find duplicates" become palette commands (this depends on the 1.1 palette). |

Nothing carried over from 1.1.

Exit criteria: with semantic search enabled, a user finds a relevant note
they had forgotten about without typing a query.

Spec: [related notes, link suggestions, duplicates](features-related-notes/spec.md).
Open question for release: the suggestion threshold (0.6) and duplicate
levels are first guesses for `bge-small-zh-v1.5`, so tune them on a real vault.

---

## Later (unscheduled, needs a direction decision)

- **iOS / iPadOS companion + iCloud sync.** Biggest growth lever and biggest
  cost. We need to design how bookmarks and sandboxing work on iOS first.
- **Share / publish.** A read-only share link or a static web page, as a
  lighter alternative to live co-editing. It must be opt-in because content
  leaves the Mac.
- **Real-time collaboration.** Already built (`src/collab`) but parked behind
  `ONLINE_COLLAB`. We revisit it only if we decide to run a server.
- **Optional LLM Q&A over the vault (RAG).** The retrieval half already
  exists. It must be explicitly opt-in, clearly labelled and checked against
  App Store review.
