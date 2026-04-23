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

function Node({ node, style, dragHandle, activePath, onContextMenu }: NodeProps) {
  const openDoc = useDocumentStore((s) => s.open);
  const isFile = node.data.kind === 'file';
  const isActive = activePath === node.data.path;

  return (
    <div
      ref={dragHandle}
      style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        cursor: 'pointer',
        background: isActive ? 'var(--selection)' : 'transparent',
        fontSize: 13,
        color: 'var(--fg-primary)',
      }}
      onClick={() => {
        if (isFile) openDoc(node.data.path);
        else node.toggle();
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(node.data.path, node.data.kind, e.clientX, e.clientY);
      }}
    >
      <span style={{ marginRight: 6, width: 12, display: 'inline-block' }}>
        {isFile ? '📄' : node.isOpen ? '▾' : '▸'}
      </span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {node.data.name}
      </span>
    </div>
  );
}
