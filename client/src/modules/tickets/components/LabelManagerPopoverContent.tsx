import React, { useState, useMemo } from 'react';
import { Button } from '@library';
import type { Label } from '../../../context/TicketContext';

export interface LabelManagerPopoverContentProps {
  projectId: string;
  assignedLabelIds: Set<string>;
  allLabels: Label[];
  onAssign: (id: string) => Promise<void> | void;
  onUnassign: (id: string) => Promise<void> | void;
  onCreate?: (name: string, color: string) => Promise<void> | void;
}

export const LabelManagerPopoverContent: React.FC<LabelManagerPopoverContentProps> = ({
  projectId,
  assignedLabelIds,
  allLabels,
  onAssign,
  onUnassign,
  onCreate,
}) => {
  const [search, setSearch] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3b82f6');
  const [isCreating, setIsCreating] = useState(false);

  const colors = [
    '#ef4444', // Red
    '#f97316', // Orange
    '#f59e0b', // Amber/Yellow
    '#10b981', // Green
    '#3b82f6', // Blue
    '#6366f1', // Indigo
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#6b7280', // Gray
  ];

  const projectLabels = useMemo(() => {
    return allLabels.filter((l) => l.projectId === projectId || !l.projectId);
  }, [allLabels, projectId]);

  const filteredLabels = useMemo(() => {
    if (!search.trim()) return projectLabels;
    return projectLabels.filter((l) =>
      l.name.toLowerCase().includes(search.toLowerCase().trim())
    );
  }, [projectLabels, search]);

  const hasExactMatch = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projectLabels.some((l) => l.name.toLowerCase() === term);
  }, [projectLabels, search]);

  const handleCreate = async () => {
    if (!search.trim() || isCreating || !onCreate) return;
    setIsCreating(true);
    try {
      await onCreate(search.trim(), selectedColor);
      setSearch('');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ fontSize: '11px', fontWeight: 650, color: 'var(--color-text-disabled)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Search {onCreate ? 'or Create ' : ''}Label
      </div>

      <input
        type="text"
        placeholder={onCreate ? "Type to search or create..." : "Type to search..."}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '6px 8px',
          fontSize: '12px',
          background: 'var(--color-base50)',
          border: '1px solid var(--color-border-default)',
          borderRadius: '4px',
          color: 'var(--color-text-primary)',
          outline: 'none',
        }}
        autoFocus
      />

      <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', margin: '4px 0' }}>
        {filteredLabels.length > 0 ? (
          filteredLabels.map((label) => {
            const isAssigned = assignedLabelIds.has(label.id);
            return (
              <label
                key={label.id}
                className="clickable"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  fontSize: '12px',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  background: isAssigned ? 'rgba(255,255,255,0.03)' : 'transparent',
                  userSelect: 'none',
                  transition: 'background 150ms ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = isAssigned ? 'rgba(255,255,255,0.03)' : 'transparent')}
              >
                <input
                  type="checkbox"
                  checked={isAssigned}
                  onChange={async () => {
                    if (isAssigned) {
                      await onUnassign(label.id);
                    } else {
                      await onAssign(label.id);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                />
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: label.color, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {label.name}
                </span>
              </label>
            );
          })
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', textAlign: 'center', padding: '8px 0' }}>
            No matching labels
          </div>
        )}
      </div>

      {onCreate && search.trim() && !hasExactMatch && (
        <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>
            CREATE NEW LABEL:
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setSelectedColor(color)}
                style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: color,
                  border: selectedColor === color ? '2px solid var(--color-text-primary)' : '1px solid rgba(0,0,0,0.2)',
                  cursor: 'pointer',
                  padding: 0,
                  transform: selectedColor === color ? 'scale(1.1)' : 'none',
                  transition: 'all 100ms ease',
                }}
              />
            ))}
          </div>

          <Button
            size="sm"
            variant="primary"
            onClick={handleCreate}
            disabled={isCreating}
            style={{ width: '100%', fontSize: '11px', height: '24px', padding: '0 8px' }}
          >
            Create "{search.trim()}"
          </Button>
        </div>
      )}
    </div>
  );
};
