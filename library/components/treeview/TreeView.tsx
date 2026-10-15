import React from 'react';
import { ChevronDown, File, Folder } from 'lucide-react';

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

  const toggleExpand = (id: string) => {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderNode = (node: TreeViewNode) => {
    const isFolder = !!node.isFolder;
    const isExpanded = !!expanded[node.id];
    const nodeContent = (
      <>
        {isFolder ? (
          <span role="img" aria-label="Folder" style={{ display: 'inline-flex' }}>
            <Folder size={14} style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
          </span>
        ) : (
          <span role="img" aria-label="File" style={{ display: 'inline-flex' }}>
            <File size={14} style={{ color: 'var(--color-text-disabled)' }} aria-hidden="true" />
          </span>
        )}
        <span>{node.label}</span>
      </>
    );
    const selectionStyle: React.CSSProperties = {
      display: 'flex',
      flex: 1,
      alignItems: 'center',
      gap: '8px',
      padding: isFolder ? '4px 8px 4px 4px' : '4px 8px',
      background: 'none',
      border: 'none',
      borderRadius: 'var(--radius-sm)',
      color: 'inherit',
      font: 'inherit',
      textAlign: 'left',
    };

    return (
      <div key={node.id} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          className={onNodeClick ? 'clickable' : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            color: 'var(--color-text-primary)',
          }}
        >
          {isFolder && (
            <button
              type="button"
              className="lib-focus-ring"
              onClick={() => toggleExpand(node.id)}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${node.label}`}
              aria-expanded={isExpanded}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0 4px 8px', color: 'var(--color-text-disabled)', display: 'flex', alignItems: 'center' }}
            >
              <ChevronDown size={14} style={{ transform: isExpanded ? 'none' : 'rotate(-90deg)', transition: 'transform var(--transition-fast)' }} aria-hidden="true" />
            </button>
          )}
          {onNodeClick ? (
            <button type="button" className="lib-focus-ring" aria-label={node.label} onClick={() => onNodeClick(node)} style={{ ...selectionStyle, cursor: 'pointer' }}>
              {nodeContent}
            </button>
          ) : (
            <div style={selectionStyle}>{nodeContent}</div>
          )}
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
