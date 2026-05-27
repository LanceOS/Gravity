import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../button';
import { Edit3 } from 'lucide-react';
import { cn } from '../../utilities';

export interface EditInPlaceProps {
  value: string;
  onSave: (newValue: string) => void;
  renderDisplay: (value: string) => React.ReactNode;
  inputStyle?: React.CSSProperties;
  containerClass?: string;
  containerStyle?: React.CSSProperties;
  saveHint?: string;
  saveOnEnter?: boolean;
  placeholder?: string;
  emptyText?: string;
  hideSaveButton?: boolean;
  alwaysEditable?: boolean;
}

export const EditInPlace: React.FC<EditInPlaceProps> = ({
  value: propValue,
  onSave,
  renderDisplay,
  inputStyle,
  containerClass = 'editable-display',
  containerStyle,
  saveHint = 'Enter',
  saveOnEnter = true,
  placeholder,
  emptyText = 'Click to edit...',
  hideSaveButton = false,
  alwaysEditable = false
}) => {
  const [isEditing, setIsEditing] = useState(alwaysEditable || false);
  const [value, setValue] = useState(propValue);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (alwaysEditable) {
      setIsEditing(true);
    }
  }, [alwaysEditable]);

  useEffect(() => {
    if (!isEditing || (alwaysEditable && !isFocused)) {
      setValue(propValue);
    }
  }, [propValue, isEditing, alwaysEditable, isFocused]);

  // Handle auto-growing height of textarea to match content exactly
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      const textarea = textareaRef.current;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [isEditing, value]);

  const handleSave = () => {
    if (!alwaysEditable) {
      setIsEditing(false);
    }
    if (value !== propValue) {
      onSave(value);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (saveOnEnter && event.key === 'Enter') {
      event.preventDefault();
      handleSave();
      if (alwaysEditable && textareaRef.current) {
        textareaRef.current.blur();
      }
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleSave();
      if (alwaysEditable && textareaRef.current) {
        textareaRef.current.blur();
      }
    }
  };

  const handleEditableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsEditing(true);
    }
  };

  return (
    <div
      onClick={!isEditing ? () => setIsEditing(true) : undefined}
      onKeyDown={!isEditing ? handleEditableKeyDown : undefined}
      className={cn(containerClass, isEditing ? 'is-editing' : '')}
      role={!isEditing ? 'button' : undefined}
      tabIndex={!isEditing ? 0 : undefined}
      title={!isEditing ? 'Click to edit' : undefined}
      style={{
        ...containerStyle,
        cursor: isEditing ? 'default' : 'pointer'
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', width: '100%' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {isEditing ? (
              <textarea
                ref={textareaRef}
                className="input auto-grow input-seamless"
                style={{
                  width: '100%',
                  border: '0px !important',
                  padding: '0px !important',
                  margin: '0px !important',
                  background: 'transparent !important',
                  boxShadow: 'none !important',
                  outline: 'none !important',
                  minHeight: '0px',
                  resize: 'none',
                  overflowY: 'hidden',
                  ...inputStyle
                }}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onFocus={() => setIsFocused(true)}
                onBlur={() => {
                  setIsFocused(false);
                  handleSave();
                }}
                placeholder={placeholder}
                onKeyDown={handleKeyDown}
                autoFocus={!alwaysEditable}
              />
            ) : (
              propValue ? renderDisplay(propValue) : (
                <span style={{ color: 'var(--color-text-disabled)', fontStyle: 'italic' }}>{emptyText}</span>
              )
            )}
          </div>

          {!isEditing && (
            <span
              className="editable-display__hint"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                ...(containerStyle?.position === 'relative' ? { position: 'absolute', top: '8px', right: '10px' } : {})
              }}
            >
              <Edit3 size={12} />
              <span>Edit</span>
            </span>
          )}
        </div>

        {isEditing && !hideSaveButton && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <Button
              onMouseDown={(e) => {
                e.preventDefault();
                handleSave();
              }}
              variant="primary"
              size="sm"
              style={{ padding: '4px 12px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <span>Save</span>
              <span aria-hidden="true" style={{ fontSize: '10px', opacity: 0.6, background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '3px' }}>{saveHint}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

