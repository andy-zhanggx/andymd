# AndyMD ↔ Typora Commercial — Feature Diff & Parity Plan

**Date:** 2026-06-16
**Branch:** `worktree-feature-parity`
**Author:** parity session

## Purpose

Catalogue every Typora commercial feature, mark what AndyMD already has, what is
**in-flight in another session/worktree** (must NOT be re-implemented here), and
what remains a **gap** for this session to close.

## Ownership map (do not duplicate)

| Area | Owner | Status |
|------|-------|--------|
| Formatting toolbar (bold/italic/heading/insert buttons) | **main worktree, live session** (`toolbarActions.ts`, `Toolbar.tsx`, `docs/features-toolbar/`) | in progress — leave alone |
| Insert image (node + import to assets) | main worktree, live | in progress — leave alone |
| Quick-open file dialog (⌘O fuzzy) | main worktree, live (`OpenFileDialog.tsx`, `quickOpen.ts`) | in progress — leave alone |
| View → Zoom (in/out/actual/zoom-to/fit-width) | `.worktrees/zoom-view` | specced — leave alone |
| Dev framework (CLAUDE.md, Makefile, docs scaffold) | `.worktrees/iter-001-agent-framework` | specced — infra, not a user feature |

## Legend
✅ have · 🟡 in-flight elsewhere (skip) · ❌ gap (this session) · ➖ out of scope

---

## File
- ✅ New / Open File / Open Workspace / Save / Save As / Close
- ✅ `.md` file association (Finder → Open With)
- ✅ External-modification detection on save
- ❌ **Open Recent** (recent files + recent workspaces submenu)
- ❌ **Export → HTML** (self-contained, styled)
- ❌ **Export → PDF** (via print pipeline)
- ❌ **Print** (⌘P)
- 🟡 (none — file ops mostly covered)
- ➖ Export to docx/epub/rtf/latex (needs pandoc) — defer
- ➖ Auto-save / file version history — defer

## Edit
- ✅ Undo/Redo/Cut/Copy/Paste/Select All (native menu)
- ❌ **Find** (⌘F) + **Find Next/Prev** (⌘G / ⌘⇧G)
- ❌ **Replace** (⌘⌥F / ⌘H)
- ❌ **Copy as Markdown** / **Copy as HTML**
- ➖ Spell check / grammar — defer (OS-level partly covers)

## Paragraph / Insert
- ✅ Headings (incl. lenient CJK), lists, task lists, code fence, math block,
  quote, table, hr, frontmatter (via editing / 🟡 toolbar)
- ✅ KaTeX math (inline + block)
- ❌ **TOC auto-block** (`[TOC]` / outline insertion) — partially via Outline panel
- ❌ **Mermaid diagrams** (```mermaid)
- ➖ Sequence/flowchart legacy renderers — defer (Mermaid supersedes)

## Format (inline marks)
- ✅ Bold / Italic / Strikethrough / Inline code (commonmark+gfm, 🟡 toolbar)
- ❌ **Highlight** (`==text==`)
- ❌ **Superscript** (`^text^`) / **Subscript** (`~text~`)
- ➖ Underline / Comment marks — defer (HTML-only in Typora)

## View
- ✅ Toggle Sidebar (⌘B)
- 🟡 Zoom in/out/actual/fit-width (zoom-view worktree)
- ❌ **Outline / TOC panel** (sidebar mode: heading tree, click-to-scroll)
- ❌ **Source code mode** (toggle raw markdown ⌘/)
- ❌ **Focus mode** (dim non-active paragraphs)
- ❌ **Typewriter mode** (keep caret vertically centered)
- ❌ **Toggle fullscreen**
- ➖ Always-on-top — defer

## Editor behaviors
- ✅ WYSIWYG live preview, code highlight, scroll memory
- ✅ Cmd+click links (browser / in-app .md), wikilinks, local images
- ❌ **Auto-pair brackets/quotes** + smart Markdown input rules beyond defaults
- ❌ **Word count / document statistics** popover (status bar shows count;
  add lines, reading time, selection count, clickable detail)
- ➖ Emoji `:smile:` autocomplete — defer (nice-to-have)
- ➖ Image uploader services — defer

## Status bar / chrome
- ✅ Word + char count, UTF-8, dirty dot
- ❌ Outline breadcrumb / cursor position (line:col)

---

## This session's parity backlog (priority order)

1. **Find & Replace** — ⌘F find, ⌘G next, ⌘⇧G prev, ⌘⌥F replace; ProseMirror
   decoration highlights, match count, case toggle.
2. **Outline panel** — sidebar tab listing headings, click scrolls to heading,
   active-heading highlight on scroll.
3. **Document statistics** — clickable status bar → popover (words, chars,
   chars-no-space, lines, reading time, selection stats).
4. **Source code mode** — ⌘/ toggles between WYSIWYG and a raw-markdown textarea;
   edits round-trip.
5. **Focus mode + Typewriter mode** — View menu toggles + CSS/scroll logic.
6. **Export HTML / Print / PDF** — File menu; render current doc to standalone
   styled HTML; print uses the same.
7. **Open Recent** — recent files + workspaces in File menu, persisted in config.
8. **Extended marks** — highlight `==`, superscript `^`, subscript `~`
   (Milkdown plugins).
9. **Auto-pair + smart input rules**.
10. **Toggle fullscreen**.

Each lands as its own commit with unit tests + a build/test gate.

---

## Status (end of session) — branch `worktree-feature-parity`

### ✅ Shipped this session (each its own commit, full test/build/cargo gate)

1. **Find & Replace** — ⌘F / ⌘G / ⌘⇧G / ⌘⌥F, decoration highlights, match
   counter, case toggle, replace + replace-all. *(also fixed a ProseMirror
   dual-instance hazard in the vitest harness)*
2. **Outline / TOC panel** — Files/Outline sidebar tabs, click-to-scroll,
   active-heading tracking; View ▸ Outline (⌘⇧1).
3. **Document statistics** — clickable status-bar popover (words, chars,
   chars-no-spaces, lines, reading time).
4. **Source code mode** — ⌘/ toggles WYSIWYG ↔ raw textarea, round-tripping.
5. **Focus mode (F8) + Typewriter mode (F9)**.
6. **Export HTML / Print / PDF** — File ▸ Export to HTML (⌘⇧E), Print (⌘P).
7. **Open Recent** — recent files + workspaces, live-rebuilt native submenu.
8. **Toggle Full Screen (F11)**.
9. **Highlight mark** — `==text==` round-trips (load/save/source/paste).

### ✅ Shipped — second batch (closing the deferred list)

10. **Superscript `^text^`** — own round-trip transformer (no dep).
11. **Live `==` / `^` input rules** — marks apply while typing.
12. **Auto-pair brackets/quotes** — pure decision fn + thin plugin.
13. **Mermaid diagrams** — `@milkdown/plugin-diagram`.
14. **Emoji `:smile:`** — `@milkdown/plugin-emoji`.
15. **Pandoc exports** — Word/ePub/LaTeX/RTF via a path-resolving Rust command.
16. **Copy as Markdown / Copy as HTML** (Edit menu).

### ✅ Shipped — third batch (closing the rest)

17. **Subscript `~text~`** — disabled GFM `singleTilde` so `~x~`=subscript and
    `~~x~~`=strikethrough (true Typora semantics); round-trip + input rule.
18. **Spell-check** — native OS spell-checking, live toggle (default on).
19. **Auto-save** — debounced save of files with a path (toggle).
20. **Version history / file recovery** — every save snapshots to an app-data
    store (deduped, last 50); File ▸ Version History modal with preview +
    restore.
21. **Smart punctuation** — `--`→–, `---`→—, `...`→… (toggle, off by default,
    code-guarded).

### Remaining (owned elsewhere / functionally covered)

- **Image insert / drag-drop / upload** — owned by the live main-worktree
  session; not duplicated here.
- **`[TOC]` in-document block** — navigation is covered by the Outline panel.
- **Grammar checking, image-upload-to-host services** — out of scope (external
  services / beyond a local editor).

### Owned elsewhere — intentionally untouched

Formatting toolbar + insert-image + quick-open (main worktree, live session),
View ▸ Zoom (`.worktrees/zoom-view`), dev framework (`.worktrees/iter-001-…`).
