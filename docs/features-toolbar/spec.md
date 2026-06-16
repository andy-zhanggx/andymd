# Markdown Formatting Toolbar

## Goal

Add a common formatting toolbar to the editor. Clicking a tool (image, math,
heading, bold, etc.) inserts the corresponding markdown construct. Constructs
that have editable content are inserted with a **placeholder hint** that is
pre-selected, so the first keystroke the user types replaces the hint with
their own input.

The editor is a Milkdown (ProseMirror) WYSIWYG surface, so "template with a
hint that clears when you type" is implemented as: insert the node/mark with
placeholder text, then set the ProseMirror selection to span that placeholder.
Typing then replaces the selection.

## UI

- An always-visible horizontal toolbar, sticky at the top of the editor pane
  (`<main>`), shown only when a document is open.
- Inline SVG icons matching the existing `SidebarIcon` style, each with a
  `title` tooltip and `aria-label`.
- Styled to match existing chrome (`--bg-secondary`, `--accent`, hover/focus).
- Buttons grouped with thin separators:
  1. Headings: H1, H2, H3
  2. Inline marks: Bold, Italic, Strikethrough, Inline code
  3. Insert: Link, Image, Inline math, Math block, Code block
  4. Blocks: Blockquote, Bullet list, Ordered list, Task list, Table,
     Horizontal rule

## Behavior

### Placeholder hints (core requirement)

Each action inserts a sensible default hint and selects it:

| Tool          | Inserted                              | Selected hint  |
|---------------|---------------------------------------|----------------|
| Bold          | `**bold text**`                       | `bold text`    |
| Italic        | `*italic text*`                       | `italic text`  |
| Strikethrough | `~~strikethrough~~`                   | `strikethrough`|
| Inline code   | `` `code` ``                          | `code`         |
| Link          | `[link text](https://)`               | `link text`    |
| Image         | image node, alt `image`, src placeholder | (alt) |
| Inline math   | inline math `c = \pm\sqrt{a^2+b^2}`   | the formula    |
| Math block    | `$$ … $$` block with a formula hint   | the formula    |
| Code block    | fenced code block, empty line         | cursor inside  |
| Heading H1–H3 | promotes current line; if empty, hint `Heading` | `Heading` |
| Blockquote    | `> quote` with hint                   | `quote`        |
| Bullet/Ordered/Task list | list item with `List item` hint | `List item` |
| Table         | a 2×2 GFM table with header hints     | first cell     |
| Horizontal rule | `---`                               | (none)         |

### Selection-aware marks

If the user has a non-empty text selection when clicking an inline mark
(Bold/Italic/Strikethrough/Inline code), the mark wraps the existing selection
instead of inserting a placeholder.

## Code structure

- `src/components/Editor/toolbarActions.ts` — pure functions, each takes the
  Milkdown `Editor` and performs the ProseMirror transaction. Unit-tested.
- `src/components/Editor/Toolbar.tsx` — renders buttons, calls actions via a
  `getEditor(): Editor | null` accessor passed as a prop.
- `MarkdownEditor.tsx` — renders `<Toolbar getEditor={() => editorRef.current}>`
  as a sibling **above** the Milkdown root div (must stay outside the root,
  which gets `innerHTML = ''` on remount).
- Toolbar styles in `src/styles/chrome.css`.

## Testing

- Unit tests for `toolbarActions.ts` against a real Milkdown editor instance in
  happy-dom (same approach as `MarkdownEditor.integration.test.ts`): assert the
  resulting markdown and that the placeholder is selected.
- Verify in the running app via the preview workflow.

## Out of scope

- Keyboard shortcuts for each tool (existing shortcut system untouched).
- Configurable/customizable toolbar contents.
- Toggling toolbar visibility (always visible for now).
