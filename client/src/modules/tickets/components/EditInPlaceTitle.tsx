import React, { useState, useEffect } from 'react';
import { Button, Textarea } from '@library';
import { Edit3 } from 'lucide-react';

interface EditInPlaceTitleProps {
  title: string;
  onSave: (newTitle: string) => void;
}

export const EditInPlaceTitle: React.FC<EditInPlaceTitleProps> = ({ title, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(title);

  // Sync with prop changes
  useEffect(() => {
    setValue(title);
  }, [title]);

  const handleSave = () => {
    setIsEditing(false);
    if (value.trim() && value !== title) {
      onSave(value.trim());
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setValue(title);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
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
            fontSize: '22px', 
            fontWeight: 600, 
            padding: '6px 8px', 
            minHeight: '38px', 
            lineHeight: 'normal',
            color: 'var(--color-text-primary)'
          }}
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
            <span aria-hidden="true" style={{ fontSize: '10px', opacity: 0.6, background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '3px' }}>Enter</span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsEditing(true)}
      onKeyDown={handleEditableKeyDown}
      className="editable-display editable-display--title"
      role="button"
      tabIndex={0}
      title="Click to edit title"
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <h1
          style={{
            fontSize: '22px',
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            margin: 0,
            flex: 1,
            minWidth: 0
          }}
        >
          {title}
        </h1>
        <span className="editable-display__hint" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' }}>
          <Edit3 size={12} />
          <span>Edit</span>
        </span>
      </div>
    </div>
  );
};
