# Update links on rename / move

## Goal

Renaming or moving a note or folder never leaves a dead link behind.
Roadmap 1.1 #4.

## Flow (`src/services/relinkService.ts`)

1. **Candidates**: the Rust command `find_files_mentioning(root, needles)` scans
   Markdown files for the old name, case-insensitively, with and without
   `.md`, and %-encoded. The moved notes themselves are always candidates,
   because their own relative links can break.
2. **Plan**: each candidate is read, and `rewriteNote` (pure,
   `src/lib/relink.ts`) resolves every link against the **old** tree and
   rewrites the ones the rename affects. An open tab with unsaved edits has
   its draft rewritten too.
3. **Ask**: if anything would change, `RelinkDialog` lists the affected notes
   and link counts and offers three choices: *Update Links*, *Rename Only* or
   *Cancel*.
4. **Apply**: rename on disk, then point open tabs at the new paths (path,
   history, stashed drafts and conflicts). Rewritten buffers are pushed into
   open tabs **before** the files are written, so the watcher's echo matches
   the tab's snapshot instead of raising a conflict.

## Rewriting rules

- **Bare `[[Name]]`**: gets the new name. If that name becomes ambiguous in the
  vault, the link switches to the vault path instead. Case-only differences
  are left alone, since Obsidian matches names case-insensitively.
- **`[[folder/Name]]`**: gets the new vault path. **`[[./x]]` and `[[../x]]`**:
  the relative path is recomputed from the linking note's (new) folder.
- **What is kept**: `#heading`, `|alias`, the `!` embed marker, and an explicit
  `.md` extension.
- **Markdown links and images** are recomputed relative to the linking note.
  They keep `#frag` and titles, `<…>` wrapping, and the %-encoding style
  (`%20` only, or full `encodeURI`). External links are skipped.
- **Code**: fenced blocks and inline code are never touched.

## Also fixed

Before this change, a tab kept the old path after a rename, so its next save
recreated the old file.

## Tests

`relink.test.ts` covers the rewriting rules. `relinkService.test.ts` covers
the full flow (update / rename only / cancel / nothing to do) with open tabs,
clean and dirty. The Rust prefilter has a unit test.
