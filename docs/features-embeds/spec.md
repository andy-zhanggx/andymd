# Embeds (`![[…]]`)

## Goal

Show `![[pic.png]]`, `![[pic.png|300]]`, `![[note]]` and `![[note#Heading]]` as
the image or note they point to. Roadmap 1.1 stretch.

## The bug this also fixes

micromark reads `![` as an image opener, so remark-wiki-link never saw
embeds: they arrived as literal text. Saving then wrote them back escaped
(`!\[\[pic.png]]`), which broke them in Obsidian. The same happened to
`[[links]]` typed in the WYSIWYG view, which were saved as `\[\[x]]` text.

## Design

- **Parse** (`src/components/Editor/wikiEmbed.ts`): an mdast transform lifts
  `![[…]]` out of text nodes (not inline code) into `wikiEmbed` nodes. A
  to-markdown handler writes them back verbatim.
- **Schema**: `wiki_embed`, an inline atom with attribute `value` (the raw
  inner text, which keeps size and alias exactly).
- **Rendering** (NodeView). The target is resolved with `resolveVaultFile`:
  - Images: an `<img>` sized by `|W` or `|WxH`.
  - Notes: a framed, read-only preview. The embedded note is parsed with
    **this editor's own parser** and rendered through the schema's
    `DOMSerializer`, so math, callouts and tables look the same as in the
    note. Only the section under `#Heading` is shown, and frontmatter is
    skipped. Relative images resolve against the embedded note's folder.
    The header opens the note (⌘ opens it in a new tab).
  - Other files: a 📎 chip. Unresolved targets are shown muted and dotted.
  - The embed re-resolves when the vault tree changes. Embeds inside a
    preview are not expanded, so there is no recursion.
- **Link resolution**: `splitWikilinkTarget` separates the path, `#heading` and
  `^block` parts. As a result, `[[note#Heading]]` no longer shows as a dead
  link. `[[#Heading]]` scrolls within the current note, and clicking a heading
  link scrolls to that heading. Attachments resolve by exact file name.
- **Typed links**: typing the final `]]` of `[[target|alias]]` or `![[x]]`
  creates the node. The auto-pair plugin shares the same helper
  (`bracketLinks.ts`), because typing over its auto-inserted `]` never
  reaches the input rules.

## Tests

`wikiEmbed.integration.test.ts` covers round-trips, the inline-code
exemption, image size, section rendering, dead embeds, and typed
links and embeds (with auto-pair). `wikilink.test.ts` covers target
splitting and attachment resolution.
