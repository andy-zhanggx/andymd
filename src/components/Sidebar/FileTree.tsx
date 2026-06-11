import { Tree, NodeRendererProps } from 'react-arborist';
import { FileNode } from '../../types';
import { useDocumentStore } from '../../stores/documentStore';

interface Props {
  root: FileNode;
  height: number;
  width: number;
  activePath: string | null;
  onContextMenu: (path: string, kind: 'file' | 'dir', x: number, y: number) => void;
}

export function FileTree({ root, height, width, activePath, onContextMenu }: Props) {
  const data = root.children ?? [];

  return (
    <Tree<FileNode>
      data={data}
      idAccessor={(n) => n.path}
      childrenAccessor={(n) => n.children ?? null}
      height={height}
      width={width}
      rowHeight={24}
      indent={16}
      openByDefault={false}
    >
      {(props) => <Node {...props} activePath={activePath} onContextMenu={onContextMenu} />}
    </Tree>
  );
}

interface NodeProps extends NodeRendererProps<FileNode> {
  activePath: string | null;
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

function Node({ node, style, dragHandle, activePath, onContextMenu }: NodeProps) {
  const openDoc = useDocumentStore((s) => s.open);
  const isFile = node.data.kind === 'file';
  const isActive = activePath === node.data.path;

  return (
    <div
      ref={dragHandle}
      className={isActive ? 'filetree-row active' : 'filetree-row'}
      style={style}
      onClick={() => {
        if (isFile) openDoc(node.data.path);
        else node.toggle();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node.data.path, node.data.kind, e.clientX, e.clientY);
      }}
    >
      <span className="filetree-glyph">
        {isFile ? <FileIcon /> : <Chevron open={node.isOpen} />}
      </span>
      <span className="filetree-name">{node.data.name}</span>
    </div>
  );
}
