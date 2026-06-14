import React, { useMemo, useState } from 'react';
import { Button } from '@library';

export interface SearchableOptionPickerOption {
  id: string;
  label: string;
  description?: string;
  searchText?: string;
  color?: string;
}

export interface SearchableOptionPickerPopoverContentProps {
  title: string;
  searchPlaceholder: string;
  options: SearchableOptionPickerOption[];
  selectedIds: Set<string>;
  onToggle: (id: string, isSelected: boolean) => Promise<void> | void;
  onCreate?: (name: string, color: string) => Promise<void> | void;
  createHeading?: string;
  createButtonLabel?: (name: string) => string;
  emptyStateLabel?: string;
  showCheckbox?: boolean;
}

const CREATE_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#6b7280',
];

function normalizeSearchTerm(value: string) {
  return value.trim().toLowerCase();
}

function buildSearchableText(option: SearchableOptionPickerOption) {
  return [
    option.label,
    option.description,
    option.searchText,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export const SearchableOptionPickerPopoverContent: React.FC<SearchableOptionPickerPopoverContentProps> = ({
  title,
  searchPlaceholder,
  options,
  selectedIds,
  onToggle,
  onCreate,
  createHeading = 'CREATE NEW ITEM:',
  createButtonLabel,
  emptyStateLabel = 'No matching items',
  showCheckbox = true,
}) => {
  const [search, setSearch] = useState('');
  const [selectedColor, setSelectedColor] = useState(CREATE_COLORS[4]);
  const [isCreating, setIsCreating] = useState(false);

  const normalizedSearch = normalizeSearchTerm(search);

  const filteredOptions = useMemo(() => {
    if (!normalizedSearch) {
      return options;
    }

    return options.filter((option) => buildSearchableText(option).includes(normalizedSearch));
  }, [normalizedSearch, options]);

  const hasExactMatch = useMemo(() => {
    if (!onCreate || !normalizedSearch) {
      return true;
    }

    return options.some((option) => normalizeSearchTerm(option.label) === normalizedSearch);
  }, [normalizedSearch, onCreate, options]);

  const handleCreate = async () => {
    if (!onCreate || !search.trim() || isCreating || hasExactMatch) {
      return;
    }

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
      <div
        style={{
          fontSize: '11px',
          fontWeight: 650,
          color: 'var(--color-text-disabled)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}
      >
        {title}
      </div>

      <input
        type="text"
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label={title}
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
        {filteredOptions.length > 0 ? (
          filteredOptions.map((option) => {
            const isSelected = selectedIds.has(option.id);
            const defaultBackground = isSelected ? 'rgba(255,255,255,0.03)' : 'transparent';
            const rowStyle = {
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
              color: 'var(--color-text-primary)',
              cursor: 'pointer',
              padding: '4px 6px',
              borderRadius: '4px',
              background: defaultBackground,
              userSelect: 'none',
              transition: 'background 150ms ease',
            } as const;

            const rowLabel = (
              <>
                {option.color ? (
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: option.color,
                      flexShrink: 0,
                    }}
                  />
                ) : null}
                <span style={{ display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0, flex: 1 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {option.label}
                  </span>
                  {option.description ? (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text-disabled)', fontSize: '11px' }}>
                      {option.description}
                    </span>
                  ) : null}
                </span>
              </>
            );

            if (!showCheckbox) {
              return (
                <button
                  key={option.id}
                  type="button"
                  className="clickable"
                  aria-pressed={isSelected}
                  aria-label={option.description ? `${option.label} - ${option.description}` : option.label}
                  style={{
                    ...rowStyle,
                    width: '100%',
                    border: 'none',
                    textAlign: 'left',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = defaultBackground;
                  }}
                  data-selected={isSelected}
                  onClick={() => {
                    void onToggle(option.id, isSelected);
                  }}
                >
                  {rowLabel}
                </button>
              );
            }

            return (
              <label
                key={option.id}
                htmlFor={`option-${option.id}`}
                className="clickable"
                style={{
                  ...rowStyle,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = defaultBackground;
                }}
                data-selected={isSelected}
              >
                <input
                  id={`option-${option.id}`}
                  type="checkbox"
                  checked={isSelected}
                  onChange={async () => {
                    await onToggle(option.id, isSelected);
                  }}
                  style={{
                    cursor: 'pointer',
                    width: '10px',
                    height: '10px',
                    border: `1px solid ${isSelected ? 'var(--color-text-primary)' : 'var(--color-text-disabled)'}`,
                    borderRadius: '3px',
                    background: isSelected ? 'var(--color-text-primary)' : 'transparent',
                    appearance: 'none',
                    WebkitAppearance: 'none',
                    MozAppearance: 'none',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
                {rowLabel}
              </label>
            );
          })
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', textAlign: 'center', padding: '8px 0' }}>
            {emptyStateLabel}
          </div>
        )}
      </div>

      {onCreate && normalizedSearch && !hasExactMatch ? (
        <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '10px', fontWeight: 600, color: 'var(--color-text-disabled)' }}>
            {createHeading}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '6px' }}>
            {CREATE_COLORS.map((color) => (
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
            {createButtonLabel ? createButtonLabel(search.trim()) : `Create "${search.trim()}"`}
          </Button>
        </div>
      ) : null}
    </div>
  );
};
