import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';
import { cn } from '../../utilities';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

function normalizeSelectValue(value: React.SelectHTMLAttributes<HTMLSelectElement>['value']) {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  if (value === undefined || value === null) {
    return '';
  }

  return String(value);
}

function getFirstEnabledSelectIndex(options: readonly SelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}

function getLastEnabledSelectIndex(options: readonly SelectOption[]) {
  for (let index = options.length - 1; index >= 0; index -= 1) {
    if (!options[index]?.disabled) {
      return index;
    }
  }

  return -1;
}

function getAdjacentEnabledSelectIndex(options: readonly SelectOption[], currentIndex: number, direction: 1 | -1) {
  if (options.length === 0) {
    return -1;
  }

  if (currentIndex < 0) {
    return direction === 1 ? getFirstEnabledSelectIndex(options) : getLastEnabledSelectIndex(options);
  }

  for (let step = 1; step <= options.length; step += 1) {
    const nextIndex = (currentIndex + step * direction + options.length) % options.length;
    if (!options[nextIndex]?.disabled) {
      return nextIndex;
    }
  }

  return currentIndex;
}

function createSelectChangeEvent(nextValue: string) {
  return {
    target: { value: nextValue },
    currentTarget: { value: nextValue },
  } as React.ChangeEvent<HTMLSelectElement>;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}


export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  options: readonly SelectOption[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
  onChange?: React.ChangeEventHandler<HTMLSelectElement>;
}

export function Select({
  label,
  error,
  options,
  placeholder,
  onValueChange,
  onChange,
  className = '',
  id,
  style,
  value,
  disabled,
  ...props
}: SelectProps) {
  const { name, ...triggerProps } = props;
  const buttonProps = triggerProps as unknown as Omit<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    'onClick' | 'onKeyDown' | 'value' | 'defaultValue' | 'type'
  >;
  const generatedId = React.useId();
  const selectId = id || generatedId;
  const labelId = `${selectId}-label`;
  const menuId = `${selectId}-menu`;
  const errorId = `${selectId}-error`;
  const triggerRef = React.useRef<HTMLButtonElement | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [menuStyle, setMenuStyle] = React.useState<React.CSSProperties>({});

  const allOptions = React.useMemo(
    () => (placeholder ? [{ value: '', label: placeholder }, ...options] : options),
    [options, placeholder],
  );

  const selectedValue = normalizeSelectValue(value);
  const selectedIndex = allOptions.findIndex((option) => option.value === selectedValue);
  const selectedOption = selectedIndex >= 0 ? allOptions[selectedIndex] : undefined;
  const firstEnabledIndex = getFirstEnabledSelectIndex(allOptions);

  const syncMenuPosition = React.useCallback(() => {
    if (!triggerRef.current) {
      return;
    }

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const estimatedMenuWidth = triggerRect.width;
    const spaceBelow = window.innerHeight - triggerRect.bottom;
    const spaceAbove = triggerRect.top;
    const openAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    const left = Math.max(8, Math.min(triggerRect.left, window.innerWidth - estimatedMenuWidth - 8));

    setMenuStyle({
      position: 'fixed',
      zIndex: 1400,
      left: `${left}px`,
      top: openAbove ? `${Math.max(8, triggerRect.top - 4)}px` : `${triggerRect.bottom + 4}px`,
      transform: openAbove ? 'translateY(-100%)' : 'none',
      minWidth: `${triggerRect.width}px`,
      maxWidth: 'calc(100vw - 16px)',
      maxHeight: '240px',
    });
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    setActiveIndex((previousIndex) => {
      if (previousIndex >= 0 && previousIndex < allOptions.length && !allOptions[previousIndex]?.disabled) {
        return previousIndex;
      }

      return selectedIndex >= 0 ? selectedIndex : firstEnabledIndex;
    });

    syncMenuPosition();

    const handleViewportChange = () => syncMenuPosition();

    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [allOptions, firstEnabledIndex, isOpen, selectedIndex, syncMenuPosition]);

  const closeMenu = React.useCallback(() => {
    setIsOpen(false);
    setActiveIndex(-1);
  }, []);

  const commitValue = (nextValue: string) => {
    if (onChange) {
      onChange(createSelectChangeEvent(nextValue));
    }

    if (onValueChange) {
      onValueChange(nextValue);
    }

    closeMenu();
  };

  const handleTriggerClick = () => {
    if (disabled) {
      return;
    }

    setIsOpen((previousOpen) => !previousOpen);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault();
        closeMenu();
      }
      return;
    }

    if (event.key === 'Tab' && isOpen) {
      closeMenu();
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();

      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(selectedIndex >= 0 ? selectedIndex : (event.key === 'ArrowDown' ? firstEnabledIndex : getLastEnabledSelectIndex(allOptions)));
        return;
      }

      const baseIndex = activeIndex >= 0
        ? activeIndex
        : selectedIndex >= 0
          ? selectedIndex
          : event.key === 'ArrowDown'
            ? firstEnabledIndex
            : getLastEnabledSelectIndex(allOptions);

      setActiveIndex(getAdjacentEnabledSelectIndex(allOptions, baseIndex, event.key === 'ArrowDown' ? 1 : -1));
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && isOpen) {
      event.preventDefault();
      const indexToSelect = activeIndex >= 0 ? activeIndex : selectedIndex >= 0 ? selectedIndex : firstEnabledIndex;
      const option = allOptions[indexToSelect];

      if (option && !option.disabled) {
        commitValue(option.value);
      }
    }
  };

  const labelText = selectedOption?.label ?? (selectedValue === '' ? placeholder ?? '' : selectedValue);
  const labelClassName = cn('select-trigger__value', selectedValue === '' && placeholder ? 'select-trigger__value--placeholder' : '');

  return (
    <ClickAwayListener onClickAway={closeMenu}>
      <div className="select-root" style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', ...style }}>
        {label && (
          <label id={labelId} htmlFor={selectId} className="label" style={{ color: 'var(--text-heading)', fontWeight: 500 }}>
            {label}
          </label>
        )}

        <button
          type="button"
          id={selectId}
          ref={triggerRef}
          className={cn('select-trigger', className)}
          aria-labelledby={label ? labelId : undefined}
          aria-invalid={error ? 'true' : undefined}
          aria-errormessage={error ? errorId : undefined}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? menuId : undefined}
          data-open={isOpen ? 'true' : undefined}
          onClick={handleTriggerClick}
          onKeyDown={handleTriggerKeyDown}
          disabled={disabled}
          {...buttonProps}
        >
          <span className={labelClassName}>{labelText}</span>
          <ChevronDown size={14} className="select-trigger__icon" aria-hidden="true" />
        </button>

        {name ? <input type="hidden" name={name} value={selectedValue} disabled={disabled} readOnly /> : null}

        {isOpen && (
          <div
            id={menuId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            className="select-menu"
            style={menuStyle}
          >
            {allOptions.map((opt, index) => {
              const isSelected = opt.value === selectedValue;
              const isActive = index === activeIndex;

              return (
                <div
                  key={`${opt.value}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  aria-disabled={opt.disabled ? 'true' : undefined}
                  data-active={isActive ? 'true' : undefined}
                  data-selected={isSelected ? 'true' : undefined}
                  className="select-option"
                  tabIndex={-1}
                  onMouseEnter={() => {
                    if (!opt.disabled) {
                      setActiveIndex(index);
                    }
                  }}
                  onClick={() => {
                    if (!opt.disabled) {
                      commitValue(opt.value);
                    }
                  }}
                  style={{ pointerEvents: opt.disabled ? 'none' : 'auto' }}
                >
                  <span className="select-option__label">{opt.label}</span>
                  {isSelected ? <Check size={14} aria-hidden="true" /> : null}
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <span id={errorId} className="lib-field-error-msg" role="alert">
            {error}
          </span>
        )}
      </div>
    </ClickAwayListener>
  );
}
