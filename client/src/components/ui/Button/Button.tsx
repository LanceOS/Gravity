import type { ButtonProps } from './types';
import { joinButtonClassNames, sizeClassNames, variantClassNames } from './utils';

export function Button({
  variant = 'default',
  size = 'md',
  fullWidth = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  const classes = joinButtonClassNames(
    'btn',
    sizeClassNames[size],
    variantClassNames[variant],
    fullWidth ? 'btn-block' : '',
    className ?? '',
  );

  return <button type={type} className={classes} {...props} />;
}