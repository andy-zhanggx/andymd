/**
 * The command palette's catalogue. Most commands are menu actions and run
 * through `handleMenuAction(id)`; a few (insertions) carry their own `run`.
 * Pure data + filtering so it can be unit-tested without the app.
 */
import { APP_STORE_BUILD, MULTI_TABS } from '../featureFlags';

export interface Command {
  /** Menu action id (see `handleMenuAction`) or a palette-only id. */
  id: string;
  title: string;
  category: 'File' | 'Edit' | 'View' | 'Insert' | 'Vault' | 'Help';
  /** Display-only shortcut, e.g. `⇧⌘F`. */
  shortcut?: string;
  /** Extra words that should match (synonyms). */
  keywords?: string;
}

export const COMMANDS: Command[] = [
  { id: 'new', title: 'New Document', category: 'File', shortcut: '⌘N' },
  ...(MULTI_TABS ? [{ id: 'new-tab', title: 'New Tab', category: 'File', shortcut: '⌘T' } as Command] : []),
  { id: 'open', title: 'Open File…', category: 'File', shortcut: '⌘O', keywords: 'quick open' },
  { id: 'open-workspace', title: 'Open Folder…', category: 'File', shortcut: '⇧⌘O', keywords: 'workspace vault' },
  { id: 'save', title: 'Save', category: 'File', shortcut: '⌘S' },
  { id: 'save-as', title: 'Save As…', category: 'File', shortcut: '⇧⌘S' },
  { id: 'close', title: 'Close Document', category: 'File', shortcut: '⌘W' },
  { id: 'autosave-toggle', title: 'Toggle Auto Save', category: 'File' },
  { id: 'version-history', title: 'Version History…', category: 'File', keywords: 'restore revisions' },
  { id: 'export-html', title: 'Export to HTML…', category: 'File', shortcut: '⇧⌘E' },
  ...(APP_STORE_BUILD
    ? []
    : ([
        { id: 'export-docx', title: 'Export to Word (.docx)…', category: 'File', keywords: 'pandoc' },
        { id: 'export-epub', title: 'Export to ePub…', category: 'File', keywords: 'pandoc ebook' },
        { id: 'export-latex', title: 'Export to LaTeX (.tex)…', category: 'File', keywords: 'pandoc' },
        { id: 'export-rtf', title: 'Export to Rich Text (.rtf)…', category: 'File', keywords: 'pandoc' },
      ] as Command[])),
  { id: 'print', title: 'Print / Save as PDF…', category: 'File', shortcut: '⌘P', keywords: 'pdf' },
  { id: 'copy-as-markdown', title: 'Copy as Markdown', category: 'Edit', shortcut: '⇧⌘C' },
  { id: 'copy-as-html', title: 'Copy as HTML', category: 'Edit' },
  { id: 'find', title: 'Find…', category: 'Edit', shortcut: '⌘F', keywords: 'search' },
  { id: 'replace', title: 'Find and Replace…', category: 'Edit', shortcut: '⌥⌘F' },
  { id: 'find-next', title: 'Find Next', category: 'Edit', shortcut: '⌘G' },
  { id: 'find-prev', title: 'Find Previous', category: 'Edit', shortcut: '⇧⌘G' },
  { id: 'spell-toggle', title: 'Toggle Spell Check', category: 'Edit', keywords: 'spelling' },
  { id: 'smart-punctuation', title: 'Toggle Smart Punctuation', category: 'Edit', keywords: 'quotes dashes' },
  { id: 'insert-link', title: 'Link to Note…', category: 'Insert', keywords: 'wikilink [[' },
  { id: 'insert-embed', title: 'Embed Note or Image…', category: 'Insert', keywords: 'transclude ![[' },
  { id: 'insert-callout', title: 'Callout', category: 'Insert', keywords: 'admonition note tip warning' },
  { id: 'global-search', title: 'Search in Workspace…', category: 'Vault', shortcut: '⇧⌘F', keywords: 'find all' },
  { id: 'show-tags', title: 'Show Tags', category: 'Vault', keywords: '#tag hashtags' },
  { id: 'show-related', title: 'Show Related Notes', category: 'Vault', keywords: 'semantic similar meaning' },
  { id: 'suggest-links', title: 'Suggest Links for This Paragraph', category: 'Vault', keywords: 'semantic wikilink related' },
  { id: 'find-duplicates', title: 'Find Duplicate Notes…', category: 'Vault', keywords: 'semantic similar near-duplicate cleanup' },
  { id: 'toggle-sidebar', title: 'Toggle Sidebar', category: 'View', shortcut: '⇧⌘L' },
  { id: 'toggle-outline', title: 'Toggle Outline', category: 'View', shortcut: '⇧⌘1', keywords: 'toc headings' },
  { id: 'toggle-minimap', title: 'Toggle Minimap', category: 'View', shortcut: '⇧⌘M' },
  { id: 'toggle-source', title: 'Toggle Source Code Mode', category: 'View', shortcut: '⌘/', keywords: 'raw markdown' },
  { id: 'toggle-focus', title: 'Toggle Focus Mode', category: 'View', shortcut: 'F8' },
  { id: 'toggle-typewriter', title: 'Toggle Typewriter Mode', category: 'View', shortcut: 'F9' },
  { id: 'font-settings', title: 'Font Settings…', category: 'View', shortcut: '⌘,', keywords: 'typeface preferences size line height code font' },
  { id: 'zoom-in', title: 'Zoom In', category: 'View', shortcut: '⇧⌘+' },
  { id: 'zoom-out', title: 'Zoom Out', category: 'View', shortcut: '⇧⌘−' },
  { id: 'zoom-actual', title: 'Actual Size', category: 'View', shortcut: '⇧⌘0', keywords: 'zoom reset 100%' },
  { id: 'zoom-fit-width', title: 'Fit Width', category: 'View', shortcut: '⇧⌘2', keywords: 'zoom' },
  { id: 'toggle-fullscreen', title: 'Toggle Full Screen', category: 'View', shortcut: 'F11' },
  ...(MULTI_TABS
    ? [{ id: 'links-new-tab-toggle', title: 'Toggle Open Links in New Tab', category: 'View' } as Command]
    : []),
  { id: 'show-tour', title: 'Welcome Tour', category: 'Help', keywords: 'onboarding' },
  { id: 'show-whats-new', title: "What's New", category: 'Help', keywords: 'release notes changelog' },
  ...(APP_STORE_BUILD
    ? []
    : [{ id: 'software-update', title: 'Software Update…', category: 'Help', keywords: 'upgrade' } as Command]),
];

function haystack(c: Command): string {
  return `${c.category} ${c.title} ${c.keywords ?? ''}`.toLowerCase();
}

/**
 * Commands matching every word of `query` (in any field), best first: title
 * prefix, then title word-prefix, then anywhere. With an empty query, recently
 * used commands (most recent first) lead, then the catalogue order.
 */
export function filterCommands(commands: Command[], query: string, recent: string[] = []): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    const byId = new Map(commands.map((c) => [c.id, c]));
    const lead = recent.map((id) => byId.get(id)).filter((c): c is Command => !!c);
    const seen = new Set(lead.map((c) => c.id));
    return [...lead, ...commands.filter((c) => !seen.has(c.id))];
  }
  const q = words.join(' ');
  const scored: { c: Command; s: number; i: number }[] = [];
  commands.forEach((c, i) => {
    const hay = haystack(c);
    if (!words.every((w) => hay.includes(w))) return;
    const title = c.title.toLowerCase();
    let s = 1;
    if (title.startsWith(q)) s = 4;
    else if (title.split(/[\s/]+/).some((t) => t.startsWith(words[0]))) s = 3;
    else if (title.includes(q)) s = 2;
    if (recent.includes(c.id)) s += 0.5;
    scored.push({ c, s, i });
  });
  return scored.sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.c);
}

const RECENT_KEY = 'andymd.recentCommands';
const RECENT_MAX = 5;

export function loadRecentCommands(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberCommand(id: string): void {
  try {
    const next = [id, ...loadRecentCommands().filter((x) => x !== id)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — recency is a convenience only.
  }
}
