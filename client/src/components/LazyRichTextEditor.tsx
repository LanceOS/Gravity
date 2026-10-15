import { forwardRef, lazy, Suspense } from 'react';
import type { RichTextEditorHandle, RichTextEditorProps } from '@library/components/richtext/RichTextEditor';

const Editor = lazy(() => import('@library/components/richtext/RichTextEditor').then(({ RichTextEditor }) => ({
  default: RichTextEditor,
})));

export const LazyRichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function LazyRichTextEditor(props, ref) {
  return (
    <Suspense fallback={<div className={props.className} role="status" aria-label="Loading editor" style={{ minHeight: props.minHeight ?? '180px' }} />}>
      <Editor {...props} ref={ref} />
    </Suspense>
  );
});
