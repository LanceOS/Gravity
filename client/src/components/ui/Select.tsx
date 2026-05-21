import { Check, ChevronDown } from 'lucide-react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
  triggerClassName?: string;
  triggerStyle?: CSSProperties;
  menuClassName?: string;
  maxMenuHeight?: number;
}

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

function joinClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  ariaLabel,
  className,
  style,
  triggerClassName,
  triggerStyle,
  menuClassName,
  maxMenuHeight = 240,
}: SelectProps) {
  const selectId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [menuPosition, setMenuPosition] = useState<MenuPosition>(() => ({
    top: -9999,
    left: -9999,
    width: 0,
    maxHeight: maxMenuHeight,
  }));

  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const findNextEnabledIndex = (startIndex: number, direction: 1 | -1) => {
    if (options.length === 0) {
      return -1;
    }

    let cursor = startIndex;
    for (let steps = 0; steps < options.length; steps += 1) {
      cursor = (cursor + direction + options.length) % options.length;
      if (!options[cursor]?.disabled) {
        return cursor;
      }
    }

    return -1;
  };

  const focusOption = (index: number) => {
    window.requestAnimationFrame(() => {
      optionRefs.current[index]?.focus();
    });
  };

  const updateMenuPosition = () => {
    if (!triggerRef.current) {
      return;
    }

    const rect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openAbove = spaceBelow < 160 && spaceAbove > spaceBelow;
    const resolvedMaxHeight = Math.max(120, Math.min(maxMenuHeight, openAbove ? spaceAbove - 6 : spaceBelow - 6));
    const availableWidth = Math.max(0, window.innerWidth - viewportPadding * 2);
    const resolvedWidth = Math.min(rect.width, availableWidth);
    const resolvedLeft = Math.min(
      Math.max(viewportPadding, rect.left),
      window.innerWidth - viewportPadding - resolvedWidth,
    );

    setMenuPosition({
      top: openAbove ? Math.max(viewportPadding, rect.top - resolvedMaxHeight - 6) : rect.bottom + 6,
      left: resolvedLeft,
      width: resolvedWidth,
      maxHeight: resolvedMaxHeight,
    });
  };

  const closeMenu = () => {
    setIsOpen(false);
    setActiveIndex(-1);
  };

  const openMenu = (preferredIndex?: number) => {
    if (disabled || options.length === 0) {
      return;
    }

    const fallbackIndex = selectedIndex >= 0 && !options[selectedIndex]?.disabled ? selectedIndex : findNextEnabledIndex(-1, 1);
    const nextIndex = preferredIndex ?? fallbackIndex;
    setIsOpen(true);
    setActiveIndex(nextIndex);
  };

  const selectValue = (nextValue: string) => {
    if (nextValue !== value) {
      onValueChange(nextValue);
    }

    closeMenu();
    triggerRef.current?.focus();
  };

  const moveActiveOption = (direction: 1 | -1) => {
    const baseIndex = activeIndex >= 0 ? activeIndex : selectedIndex >= 0 ? selectedIndex : -1;
    const nextIndex = findNextEnabledIndex(baseIndex, direction);
    if (nextIndex >= 0) {
      setActiveIndex(nextIndex);
      focusOption(nextIndex);
    }
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        const nextIndex = selectedIndex >= 0 ? selectedIndex : findNextEnabledIndex(-1, 1);
        openMenu(nextIndex);
      } else {
        moveActiveOption(1);
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        const nextIndex = selectedIndex >= 0 ? selectedIndex : findNextEnabledIndex(options.length, -1);
        openMenu(nextIndex);
      } else {
        moveActiveOption(-1);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      closeMenu();
    }
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, index: number, option: SelectOption) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActiveOption(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActiveOption(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      const nextIndex = findNextEnabledIndex(-1, 1);
      if (nextIndex >= 0) {
        setActiveIndex(nextIndex);
        focusOption(nextIndex);
      }
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      const nextIndex = findNextEnabledIndex(0, -1);
      if (nextIndex >= 0) {
        setActiveIndex(nextIndex);
        focusOption(nextIndex);
      }
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!option.disabled) {
        selectValue(option.value);
      }
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeMenu();
      triggerRef.current?.focus();
      return;
    }

    if (event.key === 'Tab') {
      closeMenu();
    }

    setActiveIndex(index);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    updateMenuPosition();

    const handleWindowPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      closeMenu();
    };

    const handleViewportChange = () => {
      updateMenuPosition();
    };

    window.addEventListener('mousedown', handleWindowPointerDown);
    window.addEventListener('resize', handleViewportChange);
    window.addEventListener('scroll', handleViewportChange, true);

    return () => {
      window.removeEventListener('mousedown', handleWindowPointerDown);
      window.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('scroll', handleViewportChange, true);
    };
  }, [isOpen, maxMenuHeight]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextIndex = activeIndex >= 0 ? activeIndex : selectedIndex >= 0 ? selectedIndex : findNextEnabledIndex(-1, 1);
    if (nextIndex >= 0) {
      setActiveIndex(nextIndex);
      focusOption(nextIndex);
    }
  }, [activeIndex, isOpen, selectedIndex]);

  return (
    <div className={joinClassNames('select-root', className)} style={style}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={`${selectId}-listbox`}
        aria-label={ariaLabel}
        className={joinClassNames('select-trigger', triggerClassName)}
        style={triggerStyle}
        onClick={() => (isOpen ? closeMenu() : openMenu())}
        onKeyDown={handleTriggerKeyDown}
        disabled={disabled}
        data-open={isOpen ? 'true' : undefined}
      >
        <span className={joinClassNames('select-trigger__value', selectedOption ? undefined : 'select-trigger__value--placeholder')}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown size={16} className="select-trigger__icon" />
      </button>

      {isOpen
        ? createPortal(
            <div
              ref={menuRef}
              id={`${selectId}-listbox`}
              role="listbox"
              aria-label={ariaLabel}
              className={joinClassNames('select-menu', menuClassName)}
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                width: `${menuPosition.width}px`,
                maxHeight: `${menuPosition.maxHeight}px`,
              }}
            >
              {options.map((option, index) => {
                const isSelected = option.value === value;
                const isActive = index === activeIndex;

                return (
                  <button
                    key={option.value}
                    ref={(node) => {
                      optionRefs.current[index] = node;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={option.disabled}
                    className="select-option"
                    data-selected={isSelected ? 'true' : undefined}
                    data-active={isActive ? 'true' : undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => {
                      if (!option.disabled) {
                        selectValue(option.value);
                      }
                    }}
                    onKeyDown={(event) => handleOptionKeyDown(event, index, option)}
                  >
                    <span className="select-option__label">{option.label}</span>
                    {isSelected ? <Check size={14} /> : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}