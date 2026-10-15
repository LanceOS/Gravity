import { forwardRef } from 'react';
import type { RichTextEditorHandle } from '@library/components/richtext/RichTextEditor';
import { LazyRichTextEditor } from '../../../../components/LazyRichTextEditor';
import './CommentEditor.css';

export interface CommentEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  readOnly?: boolean;
  onBlur?: () => void;
}

export const CommentEditor = forwardRef<RichTextEditorHandle, CommentEditorProps>(function CommentEditor(
  {
    className,
    value,
    onChange,
    placeholder = 'Post updates, links, or mention PRs...',
    autoFocus = false,
    readOnly = false,
    onBlur,
  },
  ref,
) {
  return (
    <div className={`comment-editor-container ${className || ''}`}>
      <LazyRichTextEditor
        ref={ref}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        onBlur={onBlur}
        surface="bare"
        toolbarMode="bubble"
        minHeight="40px"
      />
    </div>
  );
});
