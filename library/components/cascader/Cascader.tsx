import React from 'react';
import { ChevronDown } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';

export interface CascaderOption {
  value: string;
  label: string;
  children?: CascaderOption[];
}

export interface CascaderProps {
  options: CascaderOption[];
  value: string[];
  onChange: (val: string[]) => void;
  placeholder?: string;
  label?: string;
}

export function Cascader({ options, value, onChange, placeholder = 'Select path', label }: CascaderProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeColumns, setActiveColumns] = React.useState<CascaderOption[][]>([options]);
  const [selectedPath, setSelectedPath] = React.useState<string[]>([]);

  const handleSelect = (option: CascaderOption, columnIndex: number) => {
    const nextPath = [...selectedPath.slice(0, columnIndex), option.value];
    setSelectedPath(nextPath);

    if (option.children && option.children.length > 0) {
      setActiveColumns([...activeColumns.slice(0, columnIndex + 1), option.children]);
    } else {
      onChange(nextPath);
      setIsOpen(false);
    }
  };

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', width: '100%' }}>
        {label && <label className="label">{label}</label>}
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            setSelectedPath(value);
          }}
          className="select-trigger clickable"
          style={{ minHeight: '36px' }}
        >
          <span style={{ fontSize: '13px' }}>
            {value.length > 0 ? value.join(' / ') : placeholder}
          </span>
          <ChevronDown size={14} className="select-trigger__icon" />
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              display: 'flex',
              backgroundColor: 'var(--color-surface-card)',
              border: '1px solid var(--color-border-default)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              marginTop: '4px',
              minWidth: '240px',
            }}
          >
            {activeColumns.map((col, colIndex) => (
              <div
                key={colIndex}
                style={{
                  borderRight: colIndex < activeColumns.length - 1 ? '1px solid var(--color-border-default)' : 'none',
                  maxHeight: '160px',
                  overflowY: 'auto',
                  padding: '4px',
                  minWidth: '120px',
                }}
              >
                {col.map((opt) => (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt, colIndex)}
                    className="clickable"
                    style={{
                      padding: '6px 8px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: selectedPath[colIndex] === opt.value ? 'var(--color-base100)' : 'transparent',
                      cursor: 'pointer',
                      fontSize: '13px',
                    }}
                  >
                    {opt.label}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
