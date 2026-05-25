import React from 'react';
import { Eye, EyeOff, Search, Calendar, Clock, Star, Upload, User, ChevronDown, Check } from 'lucide-react';
import { ClickAwayListener } from '../../utilities';
import { cn } from '../../utilities';
import { TextInput, TextInputProps } from '../textinput';

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
          color: 'var(--color-text-disabled)',
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
