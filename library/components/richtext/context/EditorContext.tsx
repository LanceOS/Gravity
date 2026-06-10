import { createContext, useContext } from 'react';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';

export interface EditorContextValue {
  view: EditorView | null;
  state: EditorState | null;
  readOnly: boolean;
  toolbarMode: 'full' | 'bubble' | 'none';
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditorContext() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error('useEditorContext must be used within an EditorProvider');
  }
  return context;
}
