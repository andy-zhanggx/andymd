import type { ReactNode } from 'react';

/**
 * Minimal inline-Markdown renderer for short, trusted strings such as
 * changelog bullets. Supports the subset that actually appears in our
 * `CHANGELOG.md`: `**bold**` / `__bold__`, `*italic*` / `_italic_`,
 * `` `code` `` and `[text](url)` links. Block constructs are out of scope —
 * the changelog parser has already flattened each bullet to a single line.
 *
 * Text is rendered through React, so HTML-special characters are escaped
 * automatically; we never use `dangerouslySetInnerHTML` here.
 */

interface Rule {
  /** Must capture the whole token; later groups are rule-specific. */
  re: RegExp;
  render: (m: RegExpExecArray, key: string) => ReactNode;
}

function openExternally(href: string, e: { preventDefault(): void }): void {
  e.preventDefault();
  // Lazy-import so this module stays free of Tauri side effects under test.
  void import('@tauri-apps/plugin-opener')
    .then((m) => m.openUrl(href))
    .catch(() => {});
}

// Tried in order at each scan position; earliest match wins, ties break by
// array order. Code comes first so its contents stay literal; bold precedes
// italic so `**x**` is not mis-read as `*` + `*x*`.
const RULES: Rule[] = [
  {
    re: /`([^`]+)`/,
    render: (m, key) => <code key={key}>{m[1]}</code>,
  },
  {
    re: /\[([^\]]+)\]\(([^)\s]+)\)/,
    render: (m, key) => (
      <a key={key} href={m[2]} onClick={(e) => openExternally(m[2], e)}>
        {renderInline(m[1], key)}
      </a>
    ),
  },
  {
    re: /(\*\*|__)([\s\S]+?)\1/,
    render: (m, key) => <strong key={key}>{renderInline(m[2], key)}</strong>,
  },
  {
    re: /(\*|_)([\s\S]+?)\1/,
    render: (m, key) => <em key={key}>{renderInline(m[2], key)}</em>,
  },
];

/** Render a single inline-Markdown string to an array of React nodes. */
export function renderInline(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    let best: { rule: Rule; m: RegExpExecArray } | null = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && (best === null || m.index < best.m.index)) {
        best = { rule, m };
        if (m.index === 0) break; // can't beat a match at the very start
      }
    }

    if (!best) {
      out.push(rest);
      break;
    }

    const { rule, m } = best;
    if (m.index > 0) out.push(rest.slice(0, m.index));
    out.push(rule.render(m, `${keyPrefix}-${n++}`));
    rest = rest.slice(m.index + m[0].length);
  }

  return out;
}
