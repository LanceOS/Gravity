import { forwardRef } from 'react';
import {
  RichTextEditor,
  type RichTextEditorHandle,
  type RichTextEditorProps,
} from '@library';

export type CommentEditorHandle = RichTextEditorHandle;

export interface CommentEditorProps extends Omit<RichTextEditorProps, 'surface' | 'toolbarMode' | 'minHeight'> {
  minHeight?: string | number;
}

export const CommentEditor = forwardRef<CommentEditorHandle, CommentEditorProps>(function CommentEditor(
  {
    minHeight = '34px',
    ...props
  },
  ref,
) {
  return (
    <RichTextEditor
      ref={ref}
      {...props}
      minHeight={minHeight}
      surface="bare"
      toolbarMode="bubble"
    />
  );
});
