import React, { useState, useEffect } from 'react';
import { Button, Textarea } from '@library';
import { Edit3 } from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';

interface EditInPlaceDescriptionProps {
  description: string;
  onSave: (newDesc: string) => void;
}

export const EditInPlaceDescription: React.FC<EditInPlaceDescriptionProps> = ({ description, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(description);

  // Sync with prop changes
  useEffect(() => {
    setValue(description);
  }, [description]);

  const handleSave = () => {
    setIsEditing(false);
    if (value !== description) {
      onSave(value);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setValue(description);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Textarea 
          className="input-seamless"
          style={{ margin: 0 }}
          inputStyle={{ 
            fontFamily: 'var(--mono)', 
            fontSize: '13px', 
            lineHeight: '1.6', 
            padding: '8px 10px',
            color: 'var(--color-text-primary)'
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Describe your issue using markdown..."
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
            <span aria-hidden="true" style={{ fontSize: '10px', opacity: 0.6, background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '3px' }}>Esc</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div 
      onClick={() => setIsEditing(true)}
      onKeyDown={handleEditableKeyDown}
      className="markdown-content editable-display editable-display--multiline"
      role="button"
      tabIndex={0}
      style={{ 
        fontSize: '13px', 
        lineHeight: '1.6', 
        minHeight: '60px', 
        paddingRight: '104px',
        position: 'relative'
      }}
    >
      <span
        className="editable-display__hint"
        style={{
          position: 'absolute',
          top: '8px',
          right: '10px',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          fontWeight: 500,
          pointerEvents: 'none'
        }}
      >
        <Edit3 size={12} />
        <span>Edit</span>
      </span>
      {description ? (
        <MarkdownContent text={description} />
      ) : (
        <span style={{ color: 'var(--color-text-disabled)', fontStyle: 'italic' }}>No description provided. Click to add details...</span>
      )}
    </div>
  );
};
