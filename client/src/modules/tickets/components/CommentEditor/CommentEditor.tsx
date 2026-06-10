import { forwardRef } from 'react';
import { Textarea, type TextareaProps } from '@library';
import './CommentEditor.css';

export interface CommentEditorProps extends Omit<TextareaProps, 'onChange'> {
  onChange: (value: string) => void;
}

export const CommentEditor = forwardRef<HTMLTextAreaElement, CommentEditorProps>(function CommentEditor(
  {
    className,
    onChange,
    ...props
  },
  ref,
) {
  return (
    <div className={`comment-editor-container ${className || ''}`}>
      <Textarea
        ref={ref}
        onChange={(e) => onChange(e.target.value)}
        autoGrow
        className="comment-editor-textarea"
        {...props}
      />
    </div>
  );
});
