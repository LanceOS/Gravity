import type { CSSProperties } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
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

export type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};