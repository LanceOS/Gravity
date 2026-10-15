import React, { forwardRef, lazy, Suspense, useCallback, useImperativeHandle, useRef } from 'react';
import type { RichTextEditorHandle, RichTextEditorProps } from './RichTextEditor';

const Editor = lazy(() => import('./RichTextEditor').then(({ RichTextEditor }) => ({ default: RichTextEditor })));

/** Keep the public editor API available without loading ProseMirror until an editor mounts. */
export const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(props, ref) {
  const editorRef = useRef<RichTextEditorHandle | null>(null);
  const readyRef = useRef(false);
  const onReadyRef = useRef(props.onReady);
  onReadyRef.current = props.onReady;
  const pendingFocus = useRef(false);
  const pendingImages = useRef<Parameters<RichTextEditorHandle['insertImage']>[0][]>([]);

  useImperativeHandle(ref, () => ({
    focus() {
      if (readyRef.current) editorRef.current?.focus();
      else pendingFocus.current = true;
    },
    insertImage(image) {
      if (readyRef.current) editorRef.current?.insertImage(image);
      else pendingImages.current.push(image);
    },
  }), []);

  const handleReady = useCallback(() => {
    readyRef.current = true;
    if (pendingFocus.current) {
      editorRef.current?.focus();
      pendingFocus.current = false;
    }
    for (const image of pendingImages.current) editorRef.current?.insertImage(image);
    pendingImages.current = [];
    onReadyRef.current?.();
  }, []);

  return (
    <Suspense fallback={
      <div
        className={props.className}
        role="status"
        aria-label="Loading editor"
        style={{ minHeight: props.minHeight ?? '180px' }}
      >
        Loading editor...
      </div>
    }>
      <Editor {...props} ref={editorRef} onReady={handleReady} />
    </Suspense>
  );
});
