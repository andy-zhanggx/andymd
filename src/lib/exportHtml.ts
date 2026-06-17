/**
 * Build a standalone, self-contained HTML document from the editor's rendered
 * body markup. Embeds a clean reading stylesheet and pulls KaTeX CSS from a CDN
 * so exported math renders. Pure + unit-tested.
 */
export function buildExportHtml(opts: { title: string; body: string }): string {
  const title = escapeHtml(opts.title);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css">
<style>${EXPORT_CSS}</style>
</head>
<body>
<article class="markdown-body">
${opts.body}
</article>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const EXPORT_CSS = `
:root { color-scheme: light dark; }
body {
  margin: 0;
  background: #fff;
  color: #1a1a1a;
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", "PingFang SC",
    "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
  line-height: 1.7;
}
.markdown-body {
  max-width: 760px;
  margin: 0 auto;
  padding: 48px 24px 96px;
  font-size: 16px;
}
.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  line-height: 1.3;
  margin: 1.6em 0 0.6em;
  font-weight: 600;
}
.markdown-body h1 { font-size: 2em; }
.markdown-body h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: .3em; }
.markdown-body h3 { font-size: 1.25em; }
.markdown-body p, .markdown-body ul, .markdown-body ol, .markdown-body blockquote { margin: 0.8em 0; }
.markdown-body a { color: #0969da; text-decoration: none; }
.markdown-body a:hover { text-decoration: underline; }
.markdown-body code {
  background: rgba(175,184,193,0.2);
  border-radius: 4px;
  padding: 0.15em 0.35em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.9em;
}
.markdown-body pre {
  background: #f6f8fa;
  border-radius: 8px;
  padding: 14px 16px;
  overflow: auto;
}
.markdown-body pre code { background: none; padding: 0; }
.markdown-body blockquote {
  border-left: 4px solid #d0d7de;
  margin-left: 0;
  padding: 0 1em;
  color: #57606a;
}
.markdown-body table { border-collapse: collapse; width: 100%; }
.markdown-body th, .markdown-body td { border: 1px solid #d0d7de; padding: 6px 13px; }
.markdown-body img { max-width: 100%; }
.markdown-body hr { border: none; border-top: 1px solid #d0d7de; margin: 2em 0; }
@media (prefers-color-scheme: dark) {
  body { background: #0d1117; color: #e6edf3; }
  .markdown-body h2 { border-bottom-color: #21262d; }
  .markdown-body pre { background: #161b22; }
  .markdown-body a { color: #58a6ff; }
  .markdown-body th, .markdown-body td, .markdown-body hr { border-color: #30363d; }
}
@media print {
  .markdown-body { max-width: none; padding: 0; }
}
`;
