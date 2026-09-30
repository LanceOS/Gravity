import React, { useEffect, useRef, useState } from 'react';
import { cn } from '../../utilities';
import { RichTextEditor } from '../richtext';

export interface MarkdownEditorProps {
  value: string;
  onSave: (newValue: string) => void | Promise<boolean | void>;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  singleLine?: boolean;
}

function normalizeSingleLineContent(content: string) {
  return content.replace(/\s*[\r\n]+\s*/g, ' ');
}

export const MarkdownEditor = ({
  value,
  onSave,
  placeholder = 'Type markdown...',
  minHeight = '120px',
  className = '',
  singleLine = false,
}: MarkdownEditorProps) => {
  const normalizedValue = singleLine ? normalizeSingleLineContent(value) : value;
  const [internalValue, setInternalValue] = useState(normalizedValue);
  const currentValueRef = useRef(internalValue);
  currentValueRef.current = internalValue;
  const pendingRef = useRef(false);
  const queuedValueRef = useRef<string | null>(null);
  const dirtyRef = useRef(false);
  const valueRef = useRef(normalizedValue);

  useEffect(() => {
    const nextValue = singleLine ? normalizeSingleLineContent(value) : value;
    if (!dirtyRef.current && !pendingRef.current && nextValue !== valueRef.current) {
      setInternalValue(nextValue);
      valueRef.current = nextValue;
    }
  }, [value, singleLine]);

  const handleBlur = async () => {
    const finalValue = singleLine ? normalizeSingleLineContent(internalValue) : internalValue;
    queuedValueRef.current = finalValue;
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      while (queuedValueRef.current !== null) {
        const submitted = queuedValueRef.current;
        queuedValueRef.current = null;
        if (submitted !== valueRef.current) {
          const saved = await onSave(submitted);
          if (saved === false) return;
          valueRef.current = submitted;
        }
        const currentValue = singleLine ? normalizeSingleLineContent(currentValueRef.current) : currentValueRef.current;
        dirtyRef.current = currentValue !== valueRef.current;
      }
    } catch {
      // The mutation owns error feedback; keep the draft for the next blur/retry.
    } finally {
      queuedValueRef.current = null;
      pendingRef.current = false;
    }
  };

  if (singleLine) {
    return (
      <div className={cn('markdown-editor-wrapper single-line', className)} style={{ width: '100%', position: 'relative' }}>
        <input
          type="text"
          value={internalValue}
          onChange={(event) => { dirtyRef.current = true; setInternalValue(event.target.value); }}
          onBlur={handleBlur}
          onKeyDown={(event) => {
            if (event.key === 'Escape' || event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
          onPaste={(event) => {
            event.preventDefault();
            const text = event.clipboardData.getData('text/plain');
            const normalized = normalizeSingleLineContent(text);
            const input = event.currentTarget;
            const start = input.selectionStart || 0;
            const end = input.selectionEnd || 0;
            const nextValue = internalValue.substring(0, start) + normalized + internalValue.substring(end);
            dirtyRef.current = true;
            setInternalValue(nextValue);
          }}
          placeholder={placeholder}
          style={{
            width: '100%',
            minHeight,
            outline: 'none',
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            font: 'inherit',
            padding: 0,
          }}
          className="input-seamless"
        />
      </div>
    );
  }

  return (
    <div className={cn('markdown-editor-wrapper', className)} style={{ width: '100%', position: 'relative' }}>
      <RichTextEditor
        value={internalValue}
        onChange={value => { dirtyRef.current = true; setInternalValue(value); }}
        onBlur={handleBlur}
        placeholder={placeholder}
        minHeight={minHeight}
        toolbarMode="full"
      />
    </div>
  );
};
