# Product thoughts

Where AndyMD stands and how we choose what to build next. The concrete plan
lives in [ROADMAP.md](ROADMAP.md); this file records the reasoning behind it.

_Last updated: 2026-09-28 (after 1.0.0 and the unreleased file-tree / semantic
search work)._

## Positioning

AndyMD sits in the gap between two products:

| | Typora | Obsidian | **AndyMD** |
|---|---|---|---|
| Editing experience | Best-in-class WYSIWYG | Live preview, rougher | Typora-grade WYSIWYG |
| Vault (wikilinks, backlinks, folders) | None | Yes | Yes |
| Understands the *meaning* of notes | No | Plugins, often cloud | **Built in, on-device** |
| Distribution | Paid download | Free download | DMG + Mac App Store |

The one-line pitch is: **Typora's editor with an Obsidian vault, plus a local
brain that understands your notes without ever uploading them.**

Each feature we add should strengthen at least one of those three parts:
editing quality, vault completeness, and on-device intelligence.

## What makes a key feature

We ask three questions about every candidate:

1. **Is it a differentiator or table stakes?** Table stakes don't win users,
   but users leave when one is missing. Differentiators are what people tell
   their friends about.
2. **What does it reuse?** A feature that builds on existing infrastructure
   costs little and ships quickly. The semantic index, the file-tree index,
   the wikilink resolver and `quickOpen` all get reused below.
3. **Does it fit the constraints?** It must be offline-first, respect privacy
   (nothing leaves the Mac by default) and be sandbox-safe for the App Store
   flavor (no subprocesses, and only paths the user has picked).

## Observations (as of 1.0 + semantic search)

- **The semantic index does more work than the UI shows.** Every note is
  already split at its headings and embedded, yet the only way to use that
  today is the `≈` search toggle. Showing related notes, suggesting links and
  finding near-duplicates all read from the same vectors. Of everything we
  could build, this is the most differentiated and costs the least.
- **Obsidian compatibility has visible gaps.** We market ourselves on
  Obsidian vaults, but these are all missing:
  - callouts (`> [!note]`), which render as plain blockquotes
  - `![[embeds]]`
  - completion when you type `[[`
  - updating links when a note is renamed. `rename_path` moves the file but
    leaves links pointing at the old name, and they only turn red afterwards.
  - `#tags`

  An Obsidian user who opens their vault notices these gaps within minutes.
- **Features are hard to discover.** Focus mode, typewriter mode, zoom,
  pandoc export, semantic search and version history can only be reached
  from the menu bar or the welcome tour. A command palette makes every one of
  them findable with a single shortcut, and it gives future commands (AI
  included) somewhere obvious to live.
- **Collaboration is built but parked.** `src/collab` works, but it sits
  behind `ONLINE_COLLAB` because it needs a server, which conflicts with the
  offline, App Store–friendly identity. A lighter "share a read-only link /
  publish as web page" may serve individual users better than live co-editing.
- **The App Store opens a door to iOS.** Tauri 2 targets iOS, and the App
  Store pipeline is already in place. An iPad/iPhone companion with iCloud
  sync is probably the biggest growth lever. It is also the most expensive,
  and security-scoped bookmarks work differently on iOS.

### Update — after building 1.1 and 1.2

All of the gaps above are closed, along with the two proposed differentiators
(related notes and link suggestions, plus a duplicate finder). Building them
turned up something the observations missed: **the vault syntax wasn't just
unrendered, it was being corrupted on save.** The serializer escaped
callouts, embeds, line-leading tags and typed `[[links]]`, and lenient
headings rewrote `#include` lines inside code and Obsidian tag lines. So the
"round-trip losslessly" principle below should be tested against a real vault
before each release, not only through unit fixtures.

## Principles we're holding to

- **Local by default.** Any feature that sends content off the Mac, such as
  an LLM or publishing, must be explicit, opt-in and clearly labelled, just
  like the semantic model download.
- **Round-trip losslessly.** A new syntax (callouts, embeds, tags) must
  re-serialize byte-for-byte whenever the user didn't edit it. The vault is
  the user's data, not ours.
- **Fix gaps before adding flourishes.** Close the table-stakes gaps (1.1)
  before we promote the differentiators (1.2).
