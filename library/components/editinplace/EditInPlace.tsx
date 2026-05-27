import React, { useState, useEffect } from 'react';
import { Button } from '../button';
import { Textarea } from '../textarea';
import { Edit3 } from 'lucide-react';

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
  emptyText = 'Click to edit...'
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(propValue);

  useEffect(() => {
    setValue(propValue);
  }, [propValue]);

  const handleSave = () => {
    setIsEditing(false);
    if (value !== propValue) {
      onSave(value);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setValue(propValue);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (saveOnEnter && event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleSave();
    }
  };

  const handleEditableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      setIsEditing(true);
    }
  };

  if (isEditing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', ...containerStyle }}>
        <Textarea 
          className="input-seamless"
          style={{ margin: 0 }}
          inputStyle={inputStyle}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          autoGrow
          autoFocus
        />
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
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      onKeyDown={handleEditableKeyDown}
      className={containerClass}
      role="button"
      tabIndex={0}
      title="Click to edit"
      style={containerStyle}
    >
      {/* 
        We use an absolute positioned edit hint for multi-line / complex components, 
        or inline for simpler flex layouts, depending on how the parent styles the container.
        Here we inject the hint robustly so it works in both contexts.
      */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', width: '100%' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {propValue ? renderDisplay(propValue) : (
            <span style={{ color: 'var(--color-text-disabled)', fontStyle: 'italic' }}>{emptyText}</span>
          )}
        </div>
        
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
      </div>
    </div>
  );
};
