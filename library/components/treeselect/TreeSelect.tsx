import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface TreeNode {
  value: string;
  label: string;
  children?: TreeNode[];
}

export interface TreeSelectProps {
  nodes: TreeNode[];
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  label?: string;
}

export function TreeSelect({ nodes, value, onChange, placeholder = 'Select node', label }: TreeSelectProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [expandedNodes, setExpandedNodes] = React.useState<Record<string, boolean>>({});

  const toggleExpand = (nodeValue: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedNodes((prev) => ({ ...prev, [nodeValue]: !prev[nodeValue] }));
  };

  const renderNode = (node: TreeNode, depth = 0) => {
    const isExpanded = !!expandedNodes[node.value];
    const hasChildren = node.children && node.children.length > 0;

    return (
      <div key={node.value} style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          onClick={() => {
            onChange(node.value);
            setIsOpen(false);
          }}
          className="clickable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 8px',
            paddingLeft: `${depth * 14 + 8}px`,
            borderRadius: 'var(--radius-sm)',
            backgroundColor: value === node.value ? 'var(--color-state-selected-bg)' : 'transparent',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          {hasChildren && (
            <button
              type="button"
              onClick={(e) => toggleExpand(node.value, e)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--color-text-disabled)',
                fontSize: '10px',
              }}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          )}
          <span>{node.label}</span>
        </div>
        {hasChildren && isExpanded && node.children?.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', width: '100%' }}>
        {label && <label className="label">{label}</label>}
        <button type="button" onClick={() => setIsOpen(!isOpen)} className="select-trigger clickable">
          <span style={{ fontSize: '13px' }}>{value || placeholder}</span>
          <ChevronDown size={14} className="select-trigger__icon" />
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              backgroundColor: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              marginTop: '4px',
              maxHeight: '200px',
              overflowY: 'auto',
              padding: '6px',
            }}
          >
            {nodes.map((node) => renderNode(node))}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
