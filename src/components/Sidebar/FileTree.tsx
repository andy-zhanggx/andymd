import { Tree, NodeRendererProps } from 'react-arborist';
import { FileNode } from '../../types';
import { useDocumentStore } from '../../stores/documentStore';
import { MULTI_TABS } from '../../featureFlags';
import { highlightSegments } from '../../lib/globalSearch';
import type { TreeFilter } from '../../lib/treeFilter';

interface Props {
  /** Already pruned to the hits when `filter` is set (see `pruneTree`). */
  root: FileNode;
  height: number;
  width: number;
  activePath: string | null;
  /** Active search: highlights matches and expands every folder. */
  filter?: TreeFilter | null;
  onContextMenu: (path: string, kind: 'file' | 'dir', x: number, y: number) => void;
}

export function FileTree({ root, height, width, activePath, filter, onContextMenu }: Props) {
  const data = root.children ?? [];

  return (
    <Tree<FileNode>
      // Remount per result so `openByDefault` re-applies to the new hit set;
      // clearing the filter restores the user's collapsed state.
      key={filter ? `filter:${filter.version}` : 'tree'}
      data={data}
      idAccessor={(n) => n.path}
      childrenAccessor={(n) => n.children ?? null}
      height={height}
      width={width}
      rowHeight={24}
      indent={16}
      openByDefault={!!filter}
    >
      {(props) => (
        <Node {...props} activePath={activePath} filter={filter ?? null} onContextMenu={onContextMenu} />
      )}
    </Tree>
  );
}

interface NodeProps extends NodeRendererProps<FileNode> {
  activePath: string | null;
  filter: TreeFilter | null;
  onContextMenu: (path: string, kind: 'file' | 'dir', x: number, y: number) => void;
}

function FileIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M4 1.5h5.5L13 5v8.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1Z"
        stroke="currentColor"
      />
      <path d="M9.5 1.5V5H13" stroke="currentColor" />
    </svg>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      style={{ transform: open ? 'rotate(90deg)' : 'none' }}
    >
      <path d="M6 3.5 11 8l-5 4.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/** Marks a file listed only because its text (not its name) matched. */
function TextMatchBadge() {
  return (
    <span className="filetree-textmatch" title="Matches in text" aria-label="matches in text">
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 4h12M2 8h12M2 12h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** File/folder name with the active query highlighted. */
export function NodeName({ name, query }: { name: string; query: string | null }) {
  if (!query) return <span className="filetree-name">{name}</span>;
  return (
    <span className="filetree-name">
      {highlightSegments(name, query).map((seg, k) =>
        seg.hit ? (
          <mark key={k} className="filetree-hit">
            {seg.text}
          </mark>
        ) : (
          <span key={k}>{seg.text}</span>
        ),
      )}
    </span>
  );
}

function Node({ node, style, dragHandle, activePath, filter, onContextMenu }: NodeProps) {
  const openDoc = useDocumentStore((s) => s.open);
  const openDocInNewTab = useDocumentStore((s) => s.openInNewTab);
  const isFile = node.data.kind === 'file';
  const isActive = activePath === node.data.path;
  const hit = isFile && filter ? filter.hits.get(node.data.path) : undefined;
  const textOnly = !!hit && hit.contentHit && !hit.nameHit;

  return (
    <div
      ref={dragHandle}
      className={isActive ? 'filetree-row active' : 'filetree-row'}
      style={style}
      onClick={(e) => {
        if (isFile) {
          // ⌘/Ctrl-click opens the file in a new tab, like the editor links.
          if (MULTI_TABS && (e.metaKey || e.ctrlKey)) openDocInNewTab(node.data.path);
          else openDoc(node.data.path);
        } else node.toggle();
      }}
      onAuxClick={(e) => {
        if (MULTI_TABS && e.button === 1 && isFile) {
          e.preventDefault();
          openDocInNewTab(node.data.path);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node.data.path, node.data.kind, e.clientX, e.clientY);
      }}
    >
      <span className="filetree-glyph">
        {isFile ? <FileIcon /> : <Chevron open={node.isOpen} />}
      </span>
      <NodeName name={node.data.name} query={filter?.query ?? null} />
      {textOnly && <TextMatchBadge />}
    </div>
  );
}
