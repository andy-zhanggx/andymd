import type { Editor } from '@milkdown/core';
import type { ReactNode } from 'react';
import {
  insertBold,
  insertItalic,
  insertStrikethrough,
  insertInlineCode,
  insertLink,
  setHeading,
  insertBlockquote,
  insertBulletList,
  insertOrderedList,
  insertTaskList,
  insertCodeBlock,
  insertHr,
  insertTable,
  insertImagePlaceholder,
  insertInlineMath,
  insertMathBlock,
} from './toolbarActions';

interface ToolbarProps {
  /** Accessor for the live editor instance (null until the editor mounts). */
  getEditor: () => Editor | null;
}

interface ToolItem {
  key: string;
  label: string;
  icon: ReactNode;
  run: (editor: Editor) => void;
}

const svg = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    {children}
  </svg>
);

const glyph = (text: string, size = 9) => (
  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
    <text
      x="8"
      y="8"
      textAnchor="middle"
      dominantBaseline="central"
      fontSize={size}
      fontWeight="600"
      fill="currentColor"
      fontFamily="inherit"
    >
      {text}
    </text>
  </svg>
);

const stroke = { stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

// Tool groups, separated by thin dividers in the rendered bar.
const GROUPS: ToolItem[][] = [
  [
    { key: 'h1', label: 'Heading 1', icon: glyph('H1', 8), run: (e) => setHeading(e, 1) },
    { key: 'h2', label: 'Heading 2', icon: glyph('H2', 8), run: (e) => setHeading(e, 2) },
    { key: 'h3', label: 'Heading 3', icon: glyph('H3', 8), run: (e) => setHeading(e, 3) },
  ],
  [
    {
      key: 'bold',
      label: 'Bold',
      icon: glyph('B', 11),
      run: insertBold,
    },
    {
      key: 'italic',
      label: 'Italic',
      icon: svg(
        <text x="8" y="8" textAnchor="middle" dominantBaseline="central" fontSize="11" fontStyle="italic" fontFamily="Georgia, serif" fill="currentColor">
          I
        </text>,
      ),
      run: insertItalic,
    },
    {
      key: 'strike',
      label: 'Strikethrough',
      icon: svg(
        <>
          <text x="8" y="8.5" textAnchor="middle" dominantBaseline="central" fontSize="10" fontWeight="600" fill="currentColor">S</text>
          <line x1="3" y1="8" x2="13" y2="8" {...stroke} />
        </>,
      ),
      run: insertStrikethrough,
    },
    {
      key: 'code',
      label: 'Inline code',
      icon: svg(
        <>
          <path d="M6 4 2.5 8 6 12" {...stroke} />
          <path d="M10 4 13.5 8 10 12" {...stroke} />
        </>,
      ),
      run: insertInlineCode,
    },
  ],
  [
    {
      key: 'link',
      label: 'Link',
      icon: svg(
        <>
          <path d="M6.5 9.5 9.5 6.5" {...stroke} />
          <path d="M7.5 4.5 8.8 3.2a2.4 2.4 0 0 1 3.4 3.4L10.9 7.9" {...stroke} />
          <path d="M8.5 11.5 7.2 12.8a2.4 2.4 0 0 1-3.4-3.4L5.1 8.1" {...stroke} />
        </>,
      ),
      run: (e) => insertLink(e),
    },
    {
      key: 'image',
      label: 'Image',
      icon: svg(
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.5" {...stroke} />
          <circle cx="5.5" cy="6.5" r="1.1" {...stroke} />
          <path d="M3 11.5 6.5 8l2 2L11 7.5l2 2.5" {...stroke} />
        </>,
      ),
      run: insertImagePlaceholder,
    },
    {
      key: 'math-inline',
      label: 'Inline math',
      icon: glyph('√x', 8),
      run: insertInlineMath,
    },
    {
      key: 'math-block',
      label: 'Math block',
      icon: svg(
        <>
          <path d="M3 3.5h3l2.2 9 2.8-9H13" {...stroke} />
          <rect x="2" y="2" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1" opacity="0.35" fill="none" />
        </>,
      ),
      run: insertMathBlock,
    },
    {
      key: 'code-block',
      label: 'Code block',
      icon: svg(
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.5" {...stroke} />
          <path d="M6.5 6.5 5 8l1.5 1.5M9.5 6.5 11 8 9.5 9.5" {...stroke} />
        </>,
      ),
      run: insertCodeBlock,
    },
  ],
  [
    {
      key: 'quote',
      label: 'Blockquote',
      icon: svg(
        <>
          <path d="M3 12V5h2.5L4 9h2v3H3Z" {...stroke} />
          <path d="M8.5 12V5H11l-1.5 4h2v3H8.5Z" {...stroke} />
        </>,
      ),
      run: insertBlockquote,
    },
    {
      key: 'ul',
      label: 'Bullet list',
      icon: svg(
        <>
          <circle cx="3" cy="4.5" r="1" fill="currentColor" />
          <circle cx="3" cy="8" r="1" fill="currentColor" />
          <circle cx="3" cy="11.5" r="1" fill="currentColor" />
          <line x1="6" y1="4.5" x2="14" y2="4.5" {...stroke} />
          <line x1="6" y1="8" x2="14" y2="8" {...stroke} />
          <line x1="6" y1="11.5" x2="14" y2="11.5" {...stroke} />
        </>,
      ),
      run: insertBulletList,
    },
    {
      key: 'ol',
      label: 'Ordered list',
      icon: svg(
        <>
          <text x="2.5" y="5" textAnchor="middle" dominantBaseline="central" fontSize="5" fontWeight="600" fill="currentColor">1</text>
          <text x="2.5" y="8.5" textAnchor="middle" dominantBaseline="central" fontSize="5" fontWeight="600" fill="currentColor">2</text>
          <text x="2.5" y="12" textAnchor="middle" dominantBaseline="central" fontSize="5" fontWeight="600" fill="currentColor">3</text>
          <line x1="6" y1="4.5" x2="14" y2="4.5" {...stroke} />
          <line x1="6" y1="8" x2="14" y2="8" {...stroke} />
          <line x1="6" y1="11.5" x2="14" y2="11.5" {...stroke} />
        </>,
      ),
      run: insertOrderedList,
    },
    {
      key: 'task',
      label: 'Task list',
      icon: svg(
        <>
          <rect x="2" y="6" width="5" height="5" rx="1" {...stroke} />
          <path d="M3.2 8.5 4.2 9.5 5.9 7.4" {...stroke} />
          <line x1="9" y1="8.5" x2="14" y2="8.5" {...stroke} />
        </>,
      ),
      run: insertTaskList,
    },
    {
      key: 'table',
      label: 'Table',
      icon: svg(
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.5" {...stroke} />
          <line x1="2" y1="6.5" x2="14" y2="6.5" {...stroke} />
          <line x1="2" y1="10" x2="14" y2="10" {...stroke} />
          <line x1="8" y1="3" x2="8" y2="13" {...stroke} />
        </>,
      ),
      run: insertTable,
    },
    {
      key: 'hr',
      label: 'Horizontal rule',
      icon: svg(<line x1="2.5" y1="8" x2="13.5" y2="8" {...stroke} strokeWidth="1.6" />),
      run: insertHr,
    },
  ],
];

export function Toolbar({ getEditor }: ToolbarProps) {
  const handle = (run: (editor: Editor) => void) => () => {
    const editor = getEditor();
    if (editor) run(editor);
  };

  return (
    <div className="md-toolbar" role="toolbar" aria-label="Formatting">
      {GROUPS.map((group, i) => (
        <div className="md-toolbar-group" key={i}>
          {group.map((tool) => (
            <button
              key={tool.key}
              type="button"
              className="md-toolbar-btn"
              title={tool.label}
              aria-label={tool.label}
              // Keep the editor selection: prevent the button from stealing focus.
              onMouseDown={(e) => e.preventDefault()}
              onClick={handle(tool.run)}
            >
              {tool.icon}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
