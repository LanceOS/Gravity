import React from 'react';
import { Search } from 'lucide-react';
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
          color: 'var(--color-text-disabled)',
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
