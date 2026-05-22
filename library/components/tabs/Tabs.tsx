import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Portal } from '../../utilities';
import { ClickAwayListener } from '../../utilities';

export interface TabsProps {
  items: TabItem[];
  defaultTab?: string;
  style?: React.CSSProperties;
}

export function Tabs({ items, defaultTab, style }: TabsProps) {
  const [activeTab, setActiveTab] = React.useState(defaultTab || items[0]?.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', ...style }}>
      {/* Tab List */}
      <div
        role="tablist"
        aria-label="Tabs navigation"
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          gap: '16px',
          marginBottom: '12px',
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
              className="clickable"
              style={{
                border: 'none',
                background: 'none',
                padding: '8px 4px',
                fontSize: '13px',
                fontWeight: isSelected ? 500 : 400,
                color: isSelected ? 'var(--accent-solid)' : 'var(--text-muted)',
                cursor: 'pointer',
                borderBottom: isSelected ? '2px solid var(--accent-solid)' : '2px solid transparent',
                transition: 'color var(--transition-fast), border-bottom-color var(--transition-fast)',
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {/* Tab Panels */}
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
