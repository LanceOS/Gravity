import React, { useEffect, useRef, useState } from 'react';
import MDEditor from '@uiw/react-md-editor';
import { cn } from '../../utilities';

export interface MarkdownEditorProps {
  value: string;
  onSave: (newValue: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  singleLine?: boolean;
}

function normalizeSingleLineContent(content: string) {
  return content.replace(/\s*[\r\n]+\s*/g, ' ');
}

export const MarkdownEditor: React.FC<MarkdownEditorProps> = ({
  value,
  onSave,
  placeholder = 'Type markdown...',
  minHeight = '120px',
  className = '',
  singleLine = false,
}) => {
  const normalizedValue = singleLine ? normalizeSingleLineContent(value) : value;
  const [internalValue, setInternalValue] = useState(normalizedValue);
  const valueRef = useRef(normalizedValue);

  useEffect(() => {
    const newNorm = singleLine ? normalizeSingleLineContent(value) : value;
    if (newNorm !== valueRef.current) {
      setInternalValue(newNorm);
      valueRef.current = newNorm;
    }
  }, [value, singleLine]);

  const handleBlur = () => {
    const finalVal = singleLine ? normalizeSingleLineContent(internalValue) : internalValue;
    if (finalVal !== valueRef.current) {
      valueRef.current = finalVal;
      onSave(finalVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.currentTarget.blur();
    }
    if (singleLine && e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  if (singleLine) {
    return (
      <div className={cn("markdown-editor-wrapper single-line", className)} style={{ width: '100%', position: 'relative' }}>
        <input
          type="text"
          value={internalValue}
          onChange={(e) => setInternalValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'Enter') {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            const normalized = normalizeSingleLineContent(text);
            const input = e.currentTarget;
            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            const newVal = internalValue.substring(0, start) + normalized + internalValue.substring(end);
            setInternalValue(newVal);
            // We can't easily set cursor position immediately after state update here, 
            // but for single line it's fine.
          }}
          placeholder={placeholder}
          style={{ width: '100%', minHeight, outline: 'none', background: 'transparent', border: 'none', color: 'inherit', font: 'inherit', padding: 0 }}
          className="input-seamless"
        />
      </div>
    );
  }

  return (
    <div className={cn("markdown-editor-wrapper", className)} style={{ width: '100%', position: 'relative' }} data-color-mode="dark">
      <MDEditor
        value={internalValue}
        onChange={(val) => setInternalValue(val || '')}
        preview="edit"
        hideToolbar={false}
        textareaProps={{
          placeholder,
          onBlur: handleBlur,
          onKeyDown: handleKeyDown
        }}
        height={minHeight === 'auto' ? undefined : parseInt(minHeight) || 120}
        minHeight={parseInt(minHeight) || 120}
      />
    </div>
  );
};
