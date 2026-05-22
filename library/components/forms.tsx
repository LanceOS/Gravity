import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

// Helper to join class names
function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

// 0. Button
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'secondary' | 'danger' | 'ghost' | 'link' | 'accent';
  size?: 'xs' | 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}
export function Button({
  children,
  variant = 'default',
  size = 'md',
  fullWidth = false,
  loading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  style,
  type = 'button',
  ...props
}: ButtonProps) {
  const sizePadding = {
    xs: '4px 8px',
    sm: '6px 12px',
    md: '8px 16px',
    lg: '10px 20px',
  }[size];

  const sizeFontSize = {
    xs: '11px',
    sm: '12px',
    md: '13px',
    lg: '14px',
  }[size];

  let bg = 'var(--card-bg)';
  let color = 'var(--text)';
  let border = '1px solid var(--border)';
  let hoverBg = 'var(--card-hover)';
  let activeBg = 'var(--border)';

  if (variant === 'primary' || variant === 'accent') {
    bg = 'var(--accent-solid)';
    color = 'var(--accent-foreground)';
    border = '1px solid var(--accent-solid)';
    hoverBg = 'var(--accent-solid-hover)';
    activeBg = 'var(--accent-solid-hover)';
  } else if (variant === 'secondary') {
    bg = 'var(--accent-glow)';
    color = 'var(--accent)';
    border = '1px solid var(--accent-border)';
    hoverBg = 'rgba(170, 59, 255, 0.2)';
    activeBg = 'rgba(170, 59, 255, 0.25)';
  } else if (variant === 'danger') {
    bg = 'var(--danger)';
    color = 'var(--danger-foreground)';
    border = '1px solid var(--danger)';
    hoverBg = 'var(--danger-hover)';
    activeBg = 'var(--danger-hover)';
  } else if (variant === 'ghost') {
    bg = 'transparent';
    color = 'var(--text)';
    border = '1px solid transparent';
    hoverBg = 'var(--card-hover)';
    activeBg = 'var(--border)';
  } else if (variant === 'link') {
    bg = 'transparent';
    color = 'var(--accent)';
    border = '1px solid transparent';
    hoverBg = 'transparent';
    activeBg = 'transparent';
  }

  const baseStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: sizePadding,
    fontSize: sizeFontSize,
    fontWeight: 500,
    borderRadius: 'var(--radius-sm)',
    backgroundColor: bg,
    color: color,
    border: border,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    opacity: disabled || loading ? 0.6 : 1,
    transition: 'all var(--transition-normal)',
    width: fullWidth ? '100%' : 'auto',
    textAlign: 'center',
    userSelect: 'none',
    boxShadow: variant === 'link' || variant === 'ghost' ? 'none' : 'var(--shadow-sm)',
    ...style,
  };

  const [isHovered, setIsHovered] = React.useState(false);
  const [isActive, setIsActive] = React.useState(false);

  const currentBg = isActive ? activeBg : isHovered ? hoverBg : bg;
  const currentStyle: React.CSSProperties = {
    ...baseStyle,
    backgroundColor: variant === 'link' ? 'transparent' : currentBg,
    textDecoration: variant === 'link' && isHovered ? 'underline' : 'none',
  };

  return (
    <button
      type={type}
      style={currentStyle}
      disabled={disabled || loading}
      onMouseEnter={() => !disabled && !loading && setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setIsActive(false);
      }}
      onMouseDown={() => !disabled && !loading && setIsActive(true)}
      onMouseUp={() => !disabled && !loading && setIsActive(false)}
      className={cn('clickable lib-focus-ring', className)}
      {...props}
    >
      {loading && (
        <span
          className="lib-spinner"
          style={{
            display: 'inline-block',
            width: '1em',
            height: '1em',
            border: '2px solid currentColor',
            borderRightColor: 'transparent',
            borderRadius: '50%',
          }}
        />
      )}
      {!loading && leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

// 1. TextInput
export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}
export function TextInput({ label, error, className = '', id, style, ...props }: TextInputProps) {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', ...style }}>
      {label && (
        <label htmlFor={inputId} className="label" style={{ color: 'var(--text-heading)', fontWeight: 500 }}>
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={cn('input', className)}
        aria-invalid={error ? 'true' : undefined}
        aria-errormessage={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <span id={errorId} className="lib-field-error-msg" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// 2. Textarea
export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}
export function Textarea({ label, error, className = '', id, style, ...props }: TextareaProps) {
  const generatedId = React.useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', ...style }}>
      {label && (
        <label htmlFor={inputId} className="label" style={{ color: 'var(--text-heading)', fontWeight: 500 }}>
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={cn('input', className)}
        style={{ minHeight: '80px', resize: 'vertical' }}
        aria-invalid={error ? 'true' : undefined}
        aria-errormessage={error ? errorId : undefined}
        {...props}
      />
      {error && (
        <span id={errorId} className="lib-field-error-msg" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

// 3. PasswordInput
export interface PasswordInputProps extends TextInputProps { }
export function PasswordInput({ className = '', ...props }: PasswordInputProps) {
  const [show, setShow] = React.useState(false);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <TextInput
        type={show ? 'text' : 'password'}
        className={cn(className)}
        style={{ paddingRight: '40px' }}
        {...props}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        aria-label={show ? 'Hide password' : 'Show password'}
        style={{
          position: 'absolute',
          right: '8px',
          bottom: '8px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

// 4. NumberInput
export interface NumberInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  onNumberChange?: (val: number) => void;
}
export function NumberInput({ label, error, onNumberChange, className = '', ...props }: NumberInputProps) {
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onNumberChange) {
      onNumberChange(parseFloat(e.target.value) || 0);
    }
  };

  return (
    <TextInput
      type="number"
      label={label}
      error={error}
      className={className}
      onChange={handleInputChange}
      {...props}
    />
  );
}

// 5. SearchInput
export interface SearchInputProps extends TextInputProps { }
export function SearchInput({ className = '', ...props }: SearchInputProps) {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          position: 'absolute',
          left: '10px',
          bottom: '10px',
          color: 'var(--text-muted)',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <Search size={15} />
      </div>
      <TextInput
        type="search"
        className={cn(className)}
        style={{ paddingLeft: '32px' }}
        {...props}
      />
    </div>
  );
}

// 6. Select (Native wrap)
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
      <div className="select-root" style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: 'fit-content', ...style }}>
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

// 7. Checkbox
export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}
export function Checkbox({ label, error, className = '', style, ...props }: CheckboxProps) {
  const checkboxId = React.useId();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', ...style }}>
      <label
        htmlFor={checkboxId}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: '13px',
          color: 'var(--text)',
        }}
      >
        <input
          type="checkbox"
          id={checkboxId}
          className={className}
          style={{
            cursor: 'pointer',
            accentColor: 'var(--accent-solid)',
            width: '15px',
            height: '15px',
          }}
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && <span className="lib-field-error-msg">{error}</span>}
    </div>
  );
}

// 8. RadioGroup
export interface RadioOption {
  value: string;
  label: string;
}
export interface RadioGroupProps {
  label: string;
  name: string;
  options: RadioOption[];
  value?: string;
  onChange?: (val: string) => void;
  style?: React.CSSProperties;
}
export function RadioGroup({ label, name, options, value, onChange, style }: RadioGroupProps) {
  return (
    <fieldset
      style={{
        border: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        ...style,
      }}
    >
      <legend className="label" style={{ padding: 0, marginBottom: '4px', color: 'var(--text-heading)' }}>
        {label}
      </legend>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {options.map((opt) => {
          const optId = `${name}-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={optId}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer',
                fontSize: '13px',
                color: 'var(--text)',
              }}
            >
              <input
                type="radio"
                id={optId}
                name={name}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onChange?.(opt.value)}
                style={{ accentColor: 'var(--accent-solid)' }}
              />
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// 9. Switch (`role="switch"`)
export interface SwitchProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}
export function Switch({ label, checked, onCheckedChange, style, className = '', ...props }: SwitchProps) {
  const switchId = React.useId();

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', ...style }}>
      <button
        type="button"
        id={switchId}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onCheckedChange(!checked)}
        className={cn('clickable', className)}
        style={{
          width: '36px',
          height: '20px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: checked ? 'var(--accent-solid)' : 'var(--border)',
          border: '1px solid var(--border)',
          position: 'relative',
          padding: 0,
          cursor: 'pointer',
          transition: 'background-color var(--transition-normal)',
        }}
        {...props}
      >
        <span
          style={{
            display: 'block',
            width: '14px',
            height: '14px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            boxShadow: 'var(--shadow-sm)',
            position: 'absolute',
            top: '2px',
            left: checked ? '18px' : '2px',
            transition: 'left var(--transition-normal)',
          }}
        />
      </button>
      <label htmlFor={switchId} style={{ fontSize: '13px', cursor: 'pointer', color: 'var(--text)' }}>
        {label}
      </label>
    </div>
  );
}

// 10. Autocomplete / Combobox (with aria-activedescendant)
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
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
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
                      ? 'var(--card-hover)'
                      : opt.value === value
                        ? 'var(--accent-glow)'
                        : 'transparent',
                  color: 'var(--text-heading)',
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

// 11. Cascader (Hierarchical Selector)
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
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
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
                  borderRight: colIndex < activeColumns.length - 1 ? '1px solid var(--border)' : 'none',
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
                      backgroundColor: selectedPath[colIndex] === opt.value ? 'var(--card-hover)' : 'transparent',
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

// 12. TreeSelect
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
            backgroundColor: value === node.value ? 'var(--accent-glow)' : 'transparent',
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
                color: 'var(--text-muted)',
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
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
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

// 13. TransferList
export interface TransferListProps {
  leftItems: string[];
  rightItems: string[];
  onChange: (left: string[], right: string[]) => void;
  label?: string;
}
export function TransferList({ leftItems, rightItems, onChange, label }: TransferListProps) {
  const [selectedLeft, setSelectedLeft] = React.useState<Record<string, boolean>>({});
  const [selectedRight, setSelectedRight] = React.useState<Record<string, boolean>>({});

  const transferToRight = () => {
    const toMove = leftItems.filter((item) => selectedLeft[item]);
    const nextLeft = leftItems.filter((item) => !selectedLeft[item]);
    onChange(nextLeft, [...rightItems, ...toMove]);
    setSelectedLeft({});
  };

  const transferToLeft = () => {
    const toMove = rightItems.filter((item) => selectedRight[item]);
    const nextRight = rightItems.filter((item) => !selectedRight[item]);
    onChange([...leftItems, ...toMove], nextRight);
    setSelectedRight({});
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {label && <div className="label">{label}</div>}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
        {/* Left List */}
        <div
          style={{
            flex: 1,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            height: '160px',
            overflowY: 'auto',
            padding: '6px',
            backgroundColor: 'var(--card-bg)',
          }}
        >
          {leftItems.map((item) => (
            <label
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={!!selectedLeft[item]}
                onChange={(e) => setSelectedLeft({ ...selectedLeft, [item]: e.target.checked })}
              />
              {item}
            </label>
          ))}
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button type="button" onClick={transferToRight} className="btn btn-sm clickable" style={{ minWidth: '40px' }}>
            &gt;
          </button>
          <button type="button" onClick={transferToLeft} className="btn btn-sm clickable" style={{ minWidth: '40px' }}>
            &lt;
          </button>
        </div>

        {/* Right List */}
        <div
          style={{
            flex: 1,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            height: '160px',
            overflowY: 'auto',
            padding: '6px',
            backgroundColor: 'var(--card-bg)',
          }}
        >
          {rightItems.map((item) => (
            <label
              key={item}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '4px 6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={!!selectedRight[item]}
                onChange={(e) => setSelectedRight({ ...selectedRight, [item]: e.target.checked })}
              />
              {item}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// 14. ColorPicker
export interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}
export function ColorPicker({ value, onChange, label }: ColorPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const colors = ['#aa3bff', '#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#71717a'];

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {label && <label className="label">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="clickable"
          style={{
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: value,
            border: '1px solid var(--border)',
            cursor: 'pointer',
          }}
          aria-label={`Select color. Current: ${value}`}
        />
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              padding: '8px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              marginTop: '4px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '6px',
            }}
          >
            {colors.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onChange(color);
                  setIsOpen(false);
                }}
                className="clickable"
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: 'var(--radius-xs)',
                  backgroundColor: color,
                  border: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}

// 15. Rating / Rate
export interface RatingProps {
  max?: number;
  value: number;
  onChange: (val: number) => void;
  label?: string;
}
export function Rating({ max = 5, value, onChange, label }: RatingProps) {
  const [hoverVal, setHoverVal] = React.useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <div className="label">{label}</div>}
      <div style={{ display: 'flex', gap: '4px' }}>
        {Array.from({ length: max }, (_, i) => {
          const starVal = i + 1;
          const isActive = hoverVal !== null ? starVal <= hoverVal : starVal <= value;
          return (
            <button
              key={i}
              type="button"
              onMouseEnter={() => setHoverVal(starVal)}
              onMouseLeave={() => setHoverVal(null)}
              onClick={() => onChange(starVal)}
              aria-label={`Rate ${starVal} out of ${max}`}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: isActive ? 'var(--priority-medium)' : 'var(--border)',
                transition: 'color var(--transition-fast)',
              }}
            >
              <Star size={18} fill={isActive ? 'var(--priority-medium)' : 'none'} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 16. RangeSlider (multi-thumb)
export interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (val: [number, number]) => void;
  label?: string;
}
export function RangeSlider({ min, max, value, onChange, label }: RangeSliderProps) {
  const trackRef = React.useRef<HTMLDivElement | null>(null);

  const calculatePercentage = (val: number) => {
    return ((val - min) / (max - min)) * 100;
  };

  const handleDrag = (e: React.MouseEvent, thumbIndex: 0 | 1) => {
    e.preventDefault();
    if (!trackRef.current) return;

    const track = trackRef.current;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const rect = track.getBoundingClientRect();
      const clickX = moveEvent.clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
      const rawVal = Math.round(min + (percentage / 100) * (max - min));

      const nextVal = [...value] as [number, number];
      if (thumbIndex === 0) {
        nextVal[0] = Math.min(rawVal, value[1] - 1);
      } else {
        nextVal[1] = Math.max(rawVal, value[0] + 1);
      }
      onChange(nextVal);
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const leftPercent = calculatePercentage(value[0]);
  const rightPercent = calculatePercentage(value[1]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
      {label && (
        <div style={{ display: 'flex', justifyContent: 'space-between' }} className="label">
          <span>{label}</span>
          <span>
            {value[0]} - {value[1]}
          </span>
        </div>
      )}
      <div
        ref={trackRef}
        style={{
          height: '6px',
          borderRadius: 'var(--radius-full)',
          backgroundColor: 'var(--border)',
          position: 'relative',
          width: '100%',
          marginTop: '6px',
          marginBottom: '6px',
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: `${leftPercent}%`,
            right: `${100 - rightPercent}%`,
            top: 0,
            bottom: 0,
            backgroundColor: 'var(--accent-solid)',
            borderRadius: 'var(--radius-full)',
          }}
        />
        {/* Left Thumb */}
        <div
          className="clickable"
          onMouseDown={(e) => handleDrag(e, 0)}
          style={{
            position: 'absolute',
            left: `${leftPercent}%`,
            transform: 'translateX(-50%)',
            top: '-5px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '2px solid var(--accent-solid)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}
        />
        {/* Right Thumb */}
        <div
          className="clickable"
          onMouseDown={(e) => handleDrag(e, 1)}
          style={{
            position: 'absolute',
            left: `${rightPercent}%`,
            transform: 'translateX(-50%)',
            top: '-5px',
            width: '16px',
            height: '16px',
            borderRadius: '50%',
            backgroundColor: '#ffffff',
            border: '2px solid var(--accent-solid)',
            cursor: 'pointer',
            boxShadow: 'var(--shadow-sm)',
          }}
        />
      </div>
    </div>
  );
}

// 17. OTP / PinInput
export interface PinInputProps {
  length?: number;
  value: string;
  onChange: (val: string) => void;
  label?: string;
}
export function PinInput({ length = 4, value, onChange, label }: PinInputProps) {
  const inputsRef = React.useRef<Array<HTMLInputElement | null>>([]);

  const handleChange = (val: string, index: number) => {
    const cleanVal = val.slice(-1);
    const nextArr = value.split('');
    nextArr[index] = cleanVal;
    const nextStr = nextArr.join('');
    onChange(nextStr);

    if (cleanVal && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      {label && <label className="label">{label}</label>}
      <div style={{ display: 'flex', gap: '8px' }}>
        {Array.from({ length }, (_, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            className="input"
            value={value[i] || ''}
            onChange={(e) => handleChange(e.target.value, i)}
            onKeyDown={(e) => handleKeyDown(e, i)}
            style={{
              width: '40px',
              height: '40px',
              textAlign: 'center',
              fontSize: '16px',
              fontWeight: 600,
            }}
          />
        ))}
      </div>
    </div>
  );
}

// Helper to generate standard calendar days
function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

// 18. DatePicker
export interface DatePickerProps {
  value?: Date;
  onChange: (val: Date) => void;
  placeholder?: string;
  label?: string;
}
export function DatePicker({ value, onChange, placeholder = 'Pick date', label }: DatePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentDate, setCurrentDate] = React.useState(value || new Date());

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  const selectDay = (day: number) => {
    const nextDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    onChange(nextDate);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', width: '100%' }}>
        {label && <label className="label">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="select-trigger clickable"
          style={{ minHeight: '36px' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <Calendar size={14} className="select-trigger__icon" />
            {value ? value.toLocaleDateString() : placeholder}
          </span>
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              padding: '12px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              marginTop: '4px',
              width: '240px',
            }}
          >
            {/* Header controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
              <button type="button" onClick={handlePrevMonth} className="btn btn-sm clickable" style={{ padding: '2px 6px' }}>
                &lt;
              </button>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                {currentDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
              </span>
              <button type="button" onClick={handleNextMonth} className="btn btn-sm clickable" style={{ padding: '2px 6px' }}>
                &gt;
              </button>
            </div>
            {/* Day grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <span key={d} style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  {d}
                </span>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isSelected = value && value.getDate() === day && value.getMonth() === currentDate.getMonth() && value.getFullYear() === currentDate.getFullYear();
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => selectDay(day)}
                    className="clickable"
                    style={{
                      border: 'none',
                      background: isSelected ? 'var(--accent-solid)' : 'transparent',
                      color: isSelected ? '#ffffff' : 'var(--text-heading)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}

// 19. TimePicker
export interface TimePickerProps {
  value?: string;
  onChange: (val: string) => void;
  label?: string;
}
export function TimePicker({ value, onChange, label }: TimePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const times = Array.from({ length: 24 }, (_, h) => {
    const hour = h.toString().padStart(2, '0');
    return [`${hour}:00`, `${hour}:30`];
  }).flat();

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', width: '100%' }}>
        {label && <label className="label">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="select-trigger clickable"
          style={{ minHeight: '36px' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <Clock size={14} className="select-trigger__icon" />
            {value || 'Pick time'}
          </span>
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              zIndex: 1000,
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              marginTop: '4px',
              maxHeight: '160px',
              overflowY: 'auto',
              padding: '4px',
            }}
          >
            {times.map((time) => (
              <div
                key={time}
                onClick={() => {
                  onChange(time);
                  setIsOpen(false);
                }}
                className="clickable"
                style={{
                  padding: '6px 8px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: value === time ? 'var(--card-hover)' : 'transparent',
                  cursor: 'pointer',
                  fontSize: '13px',
                }}
              >
                {time}
              </div>
            ))}
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}

// 20. DateTimePicker
export interface DateTimePickerProps {
  value?: Date;
  onChange: (val: Date) => void;
  label?: string;
}
export function DateTimePicker({ value, onChange, label }: DateTimePickerProps) {
  const handleDateChange = (date: Date) => {
    const nextDate = value ? new Date(value) : new Date();
    nextDate.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    onChange(nextDate);
  };

  const handleTimeChange = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const nextDate = value ? new Date(value) : new Date();
    nextDate.setHours(hours, minutes, 0, 0);
    onChange(nextDate);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && <label className="label">{label}</label>}
      <div style={{ display: 'flex', gap: '8px' }}>
        <DatePicker value={value} onChange={handleDateChange} />
        <TimePicker
          value={value ? `${value.getHours().toString().padStart(2, '0')}:${value.getMinutes().toString().padStart(2, '0')}` : ''}
          onChange={handleTimeChange}
        />
      </div>
    </div>
  );
}

// 21. DateRangePicker
export interface DateRangePickerProps {
  value: [Date | undefined, Date | undefined];
  onChange: (val: [Date | undefined, Date | undefined]) => void;
  label?: string;
}
export function DateRangePicker({ value, onChange, label }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [currentDate, setCurrentDate] = React.useState(new Date());

  const daysInMonth = getDaysInMonth(currentDate.getFullYear(), currentDate.getMonth());
  const firstDay = getFirstDayOfMonth(currentDate.getFullYear(), currentDate.getMonth());

  const handlePrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const selectDay = (day: number) => {
    const clickedDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    if (!value[0] || (value[0] && value[1])) {
      onChange([clickedDate, undefined]);
    } else {
      if (clickedDate < value[0]) {
        onChange([clickedDate, undefined]);
      } else {
        onChange([value[0], clickedDate]);
        setIsOpen(false);
      }
    }
  };

  const getRangeText = () => {
    if (value[0] && value[1]) {
      return `${value[0].toLocaleDateString()} - ${value[1].toLocaleDateString()}`;
    }
    if (value[0]) {
      return `${value[0].toLocaleDateString()} - Select end date`;
    }
    return 'Select date range';
  };

  return (
    <ClickAwayListener onClickAway={() => setIsOpen(false)}>
      <div style={{ position: 'relative', width: '100%' }}>
        {label && <label className="label">{label}</label>}
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="select-trigger clickable"
          style={{ minHeight: '36px' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <Calendar size={14} className="select-trigger__icon" />
            {getRangeText()}
          </span>
        </button>
        {isOpen && (
          <div
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 1000,
              padding: '12px',
              backgroundColor: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-md)',
              marginTop: '4px',
              width: '240px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', alignItems: 'center' }}>
              <button type="button" onClick={handlePrevMonth} className="btn btn-sm clickable" style={{ padding: '2px 6px' }}>
                &lt;
              </button>
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                {currentDate.toLocaleString('default', { month: 'short', year: 'numeric' })}
              </span>
              <button type="button" onClick={handleNextMonth} className="btn btn-sm clickable" style={{ padding: '2px 6px' }}>
                &gt;
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center' }}>
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                <span key={d} style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-muted)' }}>
                  {d}
                </span>
              ))}
              {Array.from({ length: firstDay }).map((_, i) => (
                <span key={`empty-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const activeDayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                const isStart = value[0] && value[0].getDate() === day && value[0].getMonth() === currentDate.getMonth() && value[0].getFullYear() === currentDate.getFullYear();
                const isEnd = value[1] && value[1].getDate() === day && value[1].getMonth() === currentDate.getMonth() && value[1].getFullYear() === currentDate.getFullYear();
                const inRange = value[0] && value[1] && activeDayDate > value[0] && activeDayDate < value[1];

                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => selectDay(day)}
                    className="clickable"
                    style={{
                      border: 'none',
                      background: isStart || isEnd ? 'var(--accent-solid)' : inRange ? 'var(--accent-glow)' : 'transparent',
                      color: isStart || isEnd ? '#ffffff' : 'var(--text-heading)',
                      borderRadius: 'var(--radius-xs)',
                      padding: '4px',
                      cursor: 'pointer',
                      fontSize: '11px',
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </ClickAwayListener>
  );
}

// 22. FileUploader (with drag-and-drop zone)
export interface FileUploaderProps {
  onFileSelect: (files: FileList) => void;
  label?: string;
}
export function FileUploader({ onFileSelect, label }: FileUploaderProps) {
  const [isDragActive, setIsDragActive] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
      {label && <label className="label">{label}</label>}
      <div
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className="clickable"
        style={{
          border: '2px dashed var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '24px',
          textAlign: 'center',
          backgroundColor: isDragActive ? 'var(--accent-glow)' : 'var(--card-bg)',
          cursor: 'pointer',
          transition: 'background-color var(--transition-normal), border-color var(--transition-normal)',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={(e) => e.target.files && onFileSelect(e.target.files)}
          style={{ display: 'none' }}
        />
        <Upload size={24} style={{ color: 'var(--text-muted)', marginBottom: '8px' }} />
        <p style={{ fontSize: '13px', margin: 0 }}>Drag and drop files here, or click to upload</p>
      </div>
    </div>
  );
}

// 23. AvatarUpload
export interface AvatarUploadProps {
  src?: string;
  onChange: (file: File) => void;
  label?: string;
}
export function AvatarUpload({ src, onChange, label }: AvatarUploadProps) {
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onChange(e.target.files[0]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center' }}>
      {label && <label className="label">{label}</label>}
      <div
        className="clickable"
        onClick={() => fileRef.current?.click()}
        style={{
          width: '80px',
          height: '80px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border)',
          position: 'relative',
          overflow: 'hidden',
          backgroundColor: 'var(--sidebar-bg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
        }}
      >
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} style={{ display: 'none' }} />
        {src ? (
          <img src={src} alt="Avatar Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <User size={32} style={{ color: 'var(--text-muted)' }} />
        )}
      </div>
    </div>
  );
}

// 24. DenseTextInput
export interface DenseTextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const DenseTextInput = React.forwardRef<HTMLInputElement, DenseTextInputProps>(
  ({ label, error, style, id, ...props }, ref) => {
    const inputId = id || `dense-input-${Math.random().toString(36).substr(2, 9)}`;

    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {label && (
          <label
            htmlFor={inputId}
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.03em',
              userSelect: 'none'
            }}
          >
            {label}
          </label>
        )}
        <div style={{ position: 'relative' }}>
          <input
            id={inputId}
            ref={ref}
            style={{
              width: '100%',
              height: 'var(--input-height, 36px)',
              backgroundColor: 'var(--card-bg)',
              border: `1px solid ${error ? 'var(--priority-high)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-xs)',
              paddingTop: 'var(--input-padding-y, 2px)',
              paddingBottom: 'var(--input-padding-y, 2px)',
              paddingLeft: 'var(--space-2, 8px)',
              paddingRight: 'var(--space-2, 8px)',
              fontFamily: 'var(--sans)',
              fontSize: '12px',
              color: 'var(--text-heading)',
              outline: 'none',
              transition: 'border-color var(--transition-fast, 0.1s ease), box-shadow var(--transition-fast, 0.1s ease)',
              ...style
            }}
            className="dense-input-element"
            {...props}
          />
        </div>
        {error && (
          <span
            style={{
              fontSize: '10px',
              color: 'var(--priority-high)',
              fontWeight: 500
            }}
          >
            {error}
          </span>
        )}

        {/* Dynamic focus and validation stylings loaded securely at compile-time */}
        <style dangerouslySetInnerHTML={{
          __html: `
          .dense-input-element:focus {
            border-color: var(--accent) !important;
            box-shadow: 0 0 0 2px var(--accent-glow) !important;
          }
          .dense-input-element:disabled {
            background-color: var(--sidebar-bg) !important;
            color: var(--text-muted) !important;
            cursor: not-allowed;
            opacity: 0.6;
          }
          .dense-input-element:-webkit-autofill,
          .dense-input-element:-webkit-autofill:hover, 
          .dense-input-element:-webkit-autofill:focus {
            -webkit-text-fill-color: var(--text-heading) !important;
            -webkit-box-shadow: 0 0 0px 1000px var(--card-bg) inset !important;
            transition: background-color 5000s ease-in-out 0s;
          }
        `}} />
      </div>
    );
  }
);

DenseTextInput.displayName = 'DenseTextInput';

