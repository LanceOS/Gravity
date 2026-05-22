import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';
import { cn } from '../../utilities';
import { TextInput, TextInputProps } from '../textinput';

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
