import React from 'react';
import { ClickAwayListener } from '../../utilities';
import { TextInput } from '../textinput';
import type { SelectOption } from '../select';

export interface AutocompleteProps {
  label?: string;
  value: string;
  onValueChange: (val: string) => void;
  options: SelectOption[];
  placeholder?: string;
}

export function Autocomplete({ label, value, onValueChange, options, placeholder }: AutocompleteProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const listboxId = React.useId();

  const filteredOptions = React.useMemo(() => {
    return options.filter((opt) => opt.label.toLowerCase().includes(search.toLowerCase()));
  }, [options, search]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && filteredOptions[activeIndex]) {
        onValueChange(filteredOptions[activeIndex].value);
        setSearch(filteredOptions[activeIndex].label);
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', width: '100%' }}>
        <TextInput
          label={label}
          placeholder={placeholder}
          value={isOpen ? search : selectedOption?.label || ''}
          onFocus={() => {
            setSearch('');
            setIsOpen(true);
          }}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 && filteredOptions[activeIndex]
              ? `opt-${filteredOptions[activeIndex].value}`
              : undefined
          }
        />
        {isOpen && filteredOptions.length > 0 && (
          <div
            id={listboxId}
            role="listbox"
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
              maxHeight: '160px',
              overflowY: 'auto',
              marginTop: '4px',
              padding: '4px',
            }}
          >
            {filteredOptions.map((opt, index) => (
              <div
                key={opt.value}
                id={`opt-${opt.value}`}
                role="option"
                aria-selected={opt.value === value}
                onClick={() => {
                  onValueChange(opt.value);
                  setSearch(opt.label);
                  setIsOpen(false);
                }}
                className="clickable"
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor:
                    index === activeIndex
                      ? 'var(--color-base100)'
                      : opt.value === value
                        ? 'var(--color-state-selected-bg)'
                        : 'transparent',
                  color: 'var(--color-text-primary)',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}
