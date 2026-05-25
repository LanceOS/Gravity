import React from 'react';
import { User, ChevronLeft, ChevronRight, Folder, File, ChevronDown } from 'lucide-react';

export interface AccordionProps {
  items: AccordionItem[];
  style?: React.CSSProperties;
}

export function Accordion({ items, style }: AccordionProps) {
  const [openIds, setOpenIds] = React.useState<Record<string, boolean>>({});

  const toggle = (id: string) => {
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', ...style }}>
      {items.map((item) => {
        const isOpen = !!openIds[item.id];
        return (
          <div key={item.id} style={{ border: '1px solid var(--color-border-default)', borderRadius: 'var(--radius-md)' }}>
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className="clickable"
              style={{
                width: '100%',
                padding: '12px 16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--color-text-primary)',
              }}
            >
              <span>{item.title}</span>
              <span>{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div style={{ padding: '12px 16px', borderTop: '1px solid var(--color-border-default)', fontSize: '13px', color: 'var(--color-text-secondary)' }}>
                {item.content}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
