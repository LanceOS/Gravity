import { Button as LibButton } from '@library';
import type { ButtonProps } from './types';

export function Button({
  variant = 'default',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  let mappedVariant: 'default' | 'primary' | 'secondary' | 'danger' | 'ghost' | 'link' = 'default';
  if (variant === 'accent' || variant === 'primary') {
    mappedVariant = 'primary';
  } else if (variant === 'ghost') {
    mappedVariant = 'ghost';
  } else if (variant === 'danger') {
    mappedVariant = 'danger';
  }

  return (
    <LibButton
      type={type}
      variant={mappedVariant}
      size={size as 'sm' | 'md' | 'lg'}
      fullWidth={fullWidth}
      className={className}
      {...props}
    />
  );
}