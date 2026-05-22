import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../utilities/ClickAwayListener';

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
