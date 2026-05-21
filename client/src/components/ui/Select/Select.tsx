import { Select as LibSelect } from '@library';
import type { SelectProps } from './types';

export function Select({
  value,
  onValueChange,
  options,
  placeholder,
  disabled = false,
  ariaLabel,
  className,
  style,
}: SelectProps) {
  const allOptions = placeholder
    ? [{ value: '', label: placeholder }, ...options]
    : options;

  return (
    <LibSelect
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      options={allOptions}
      disabled={disabled}
      aria-label={ariaLabel}
      className={className}
      style={style}
    />
  );
}
