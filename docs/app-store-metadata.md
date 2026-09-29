# App Store Connect listing copy — AndyMD 1.0.0

Paste-ready text for the macOS listing. Character limits are Apple's; the counts
in brackets are what the text below actually uses.

> **One thing I did not do, on purpose: no "Typora" anywhere.** Apple's review
> guidelines treat a third-party trademark in the **Keywords** field as grounds
> for rejection, and it is one of the more reliably enforced metadata rules. The
> copy below sells the same idea — text that renders as you type, no split
> preview pane — in words Apple cannot object to, and those phrases are what
> people actually search for anyway. If you want the comparison made explicitly,
> put it on your website, not in the listing.

---

## Name — 30 max

```
AndyMD — Markdown Editor
```

[24] Plain "AndyMD" carries no search weight; nobody searches a brand they have
never heard of. The suffix is what gets you indexed.

## Subtitle — 30 max

```
Free WYSIWYG Markdown editor
```

[28] "Free" is the hook you asked to lead with, and both "WYSIWYG" and
"Markdown" are indexed alongside the name.

## Keywords — 100 max, comma-separated, no spaces

```
md,notes,live preview,writing,wiki links,latex,math,outline,plain text,offline,notebook,writer
```

[94] Deliberately does **not** repeat `markdown`, `editor`, `free` or `wysiwyg`
— Apple indexes the name and subtitle together with this field, so repeating
them wastes characters. No competitor names, for the reason at the top.

## Promotional Text — 170 max

Editable any time without submitting a new build, so use it for seasonal or
campaign copy later.

```
Free, with no account and no subscription. A quiet Markdown editor that renders as you type — open any folder as a notebook and start writing. Works fully offline.
```

[163]

## Description — 4000 max

```
AndyMD is a free Markdown editor for macOS. Text renders as you type — headings, bold, lists, tables, math — so you read what you wrote instead of a screen of symbols. There is no split preview pane to keep in sync, and nothing between you and the page.

Free, with no account, no subscription and no upsell. Everything below is in the app the moment you open it.

YOUR FILES STAY YOURS
Open any folder as a notebook. AndyMD reads and writes ordinary .md files in place — nothing is imported into a proprietary library, and nothing is uploaded anywhere. It works fully offline. Your notes stay readable by any text editor on any machine, for as long as you keep them.

WRITE WITHOUT FRICTION
• Live rendering as you type, with no preview pane
• Press ⌘/ to flip to the raw Markdown and back
• Tables, footnotes, task lists, and code blocks with syntax highlighting
• LaTeX math, inline and display, rendered with KaTeX
• Mermaid diagrams
• Drag an image into a note and it is copied into your folder for you
• Focus mode and typewriter mode when you want the page and nothing else

A NOTEBOOK, NOT JUST AN EDITOR
• File tree for the whole folder — create, rename, reveal in Finder, move to Trash
• Tabs for several documents at once, restored when you reopen the app
• Outline view for finding your way around long pieces
• Wiki-style [[links]] between notes, with backlinks
• Full-text search across the entire folder
• Minimap for navigating very long documents
• Version history, so you can go back to what you had

BUILT FOR LONG DOCUMENTS
Scrolling stays smooth in pieces tens of thousands of words long. Fit-width and zoom controls let you set a comfortable line length once and keep it.

DETAILS
• Light and dark, following the system
• Typography presets, or choose your own fonts and sizes
• Export to HTML, or print and save as PDF
• Opens existing Markdown folders exactly as they are — wiki links, YAML front matter, fenced math and inline HTML all survive a round trip untouched

Free. Offline. Plain text. Yours.
```

[~2100]

## What's New — 4000 max

```
First release.

AndyMD is a free, offline Markdown editor that renders as you type. Open any folder as a notebook and write — file tree, tabs, outline, wiki links, backlinks, full-text search, LaTeX math, Mermaid diagrams, and version history, all over ordinary .md files that stay yours.
```

---

## The rest of the form

| Field | Value |
|---|---|
| Category, primary | Productivity |
| Category, secondary | Developer Tools *(optional — reaches a second search surface)* |
| Price | Free (Tier 0) |
| Age rating | 4+ — answer "None" to every content question |
| Copyright | `2026 Andy Zhang` |
| Support URL | `https://github.com/andy-zhanggx/andymd/issues` |
| Marketing URL | `https://github.com/andy-zhanggx/andymd` *(optional)* |
| Privacy Policy URL | see below — **required**, must resolve |
| App Privacy | **Data Not Collected.** Answer "No" to every collection question. This must agree with `src-tauri/PrivacyInfo.xcprivacy`, which declares the two required-reason APIs (file timestamps, UserDefaults) and no collected data. |
| Export compliance | Already answered by `ITSAppUsesNonExemptEncryption=false` in `src-tauri/Info.plist`; if asked, the app uses no non-exempt encryption. |
| Sign-in required | No |
| Contact info | Your name, email and phone — reviewers only |
| Notes for reviewer | See below |

### Privacy policy

Required even though the app collects nothing. Commit `docs/privacy-policy.md`
to the repo and use its raw GitHub URL, or turn on GitHub Pages. The file is in
this repo already.

### Notes for the reviewer

```
AndyMD is a local, offline Markdown editor. It requires no account and no sign-in.

To try it: choose File > Open Folder and pick any folder — an empty new folder works. Markdown files in it appear in the sidebar. File > New Document creates one.

The app reads and writes only folders the user explicitly picks through the system open panel, re-authorized across launches with security-scoped bookmarks. It makes no network requests. The com.apple.security.network.client entitlement is present only because a sandboxed WKWebView will not load its own local content without it.
```

---

## Screenshots

macOS accepts 1280×800, 1440×900, 2560×1600 or 2880×1800. On a Retina display a
1280×800-point window captures as 2560×1600, which is the size to aim for.

At least one is required; the listing is much stronger with three or four. What
to show, in order:

1. A real document open — prose with a heading, a table and some math, file tree
   visible on the left. This is the one most people judge the app by, so it
   should look like actual work, not `Lorem ipsum`.
2. The outline panel next to a long document.
3. Source-code mode (⌘/) beside the rendered view, showing it is plain Markdown
   underneath.
4. Dark mode.

Keep the window free of anything private — the file tree will show real folder
names.
