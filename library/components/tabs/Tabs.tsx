import React from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  style?: React.CSSProperties;
}

export function Tabs({ items, defaultTab, style }: TabsProps) {
  const [activeTab, setActiveTab] = React.useState(defaultTab || items[0]?.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', ...style }}>
      <div
        role="tablist"
        aria-label="Tabs navigation"
        style={{
          display: 'flex',
          padding: '4px',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-glass-subtle)',
          width: 'fit-content',
          maxWidth: '100%',
          overflowX: 'auto',
          gap: '4px',
          marginBottom: '20px',
        }}
      >
        {items.map((item) => {
          const isSelected = item.id === activeTab;
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={isSelected}
              aria-controls={`panel-${item.id}`}
              id={`tab-${item.id}`}
              onClick={() => setActiveTab(item.id)}
              className="clickable lib-focus-ring"
              style={{
                border: 'none',
                background: isSelected ? 'var(--surface-glass-strong)' : 'transparent',
                borderRadius: 'var(--radius-sm)',
                boxShadow: isSelected ? 'var(--shadow-sm)' : 'none',
                whiteSpace: 'nowrap',
                padding: '8px 14px',
                fontSize: '13px',
                fontWeight: isSelected ? 500 : 400,
                color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'color var(--transition-fast), background-color var(--transition-fast), box-shadow var(--transition-fast)',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {items.map((item) => {
        const isSelected = item.id === activeTab;
        return (
          <div
            key={item.id}
            id={`panel-${item.id}`}
            role="tabpanel"
            aria-labelledby={`tab-${item.id}`}
            hidden={!isSelected}
          >
            {isSelected && item.content}
          </div>
        );
      })}
    </div>
  );
}
