import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface TreeViewNode {
  id: string;
  label: string;
  isFolder?: boolean;
  children?: TreeViewNode[];
}

export interface TreeViewProps {
  nodes: TreeViewNode[];
  onNodeClick?: (node: TreeViewNode) => void;
  style?: React.CSSProperties;
}

export function TreeView({ nodes, onNodeClick, style }: TreeViewProps) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNode = (node: TreeViewNode) => {
    const isFolder = !!node.isFolder;
    const isExpanded = !!expanded[node.id];

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          onClick={() => onNodeClick?.(node)}
          className="clickable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '4px 8px',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer',
            fontSize: '13px',
            color: 'var(--color-text-primary)',
          }}
        >
          {isFolder ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                type="button"
                onClick={(e) => toggleExpand(node.id, e)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--color-text-disabled)', display: 'flex', alignItems: 'center' }}
              >
                <ChevronDown size={14} style={{ transform: isExpanded ? 'none' : 'rotate(-90deg)', transition: 'transform var(--transition-fast)' }} />
              </button>
              <Folder size={14} style={{ color: 'var(--color-primary)' }} />
            </div>
          ) : (
            <File size={14} style={{ color: 'var(--color-text-disabled)' }} />
          )}
          <span>{node.label}</span>
        </div>
        {isFolder && isExpanded && node.children && (
          <div style={{ paddingLeft: '16px', display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--color-border-default)', marginLeft: '12px' }}>
            {node.children.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      {nodes.map((node) => renderNode(node))}
    </div>
  );
}
