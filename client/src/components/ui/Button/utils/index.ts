import type { ButtonSize, ButtonVariant } from '../types';

export const variantClassNames: Record<ButtonVariant, string> = {
  default: '',
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  accent: 'btn-accent',
  danger: 'btn-danger',
};

export const sizeClassNames: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
};

export function joinButtonClassNames(...values: Array<string | undefined>) {
  return values.filter(Boolean).join(' ');
}