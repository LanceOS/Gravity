import { Plugin } from 'prosemirror-state';
import { Node as ProseMirrorNode } from 'prosemirror-model';
import { Decoration, DecorationSet } from 'prosemirror-view';

export function isEditorDocumentEmpty(doc: ProseMirrorNode) {
  let hasVisibleContent = false;

  doc.descendants((node) => {
    if (node.isText && node.text && node.text.trim().length > 0) {
      hasVisibleContent = true;
      return false;
    }

    if (node.type.name === 'image' || node.type.name === 'horizontal_rule' || node.type.name === 'hard_break') {
      hasVisibleContent = true;
      return false;
    }

    return true;
  });

  return !hasVisibleContent;
}

export function placeholderPlugin(placeholder: string) {
  return new Plugin({
    props: {
      decorations(state) {
        if (!isEditorDocumentEmpty(state.doc)) {
          return null;
        }

        const placeholderEl = document.createElement('span');
        placeholderEl.className = 'rich-text-editor__placeholder';
        placeholderEl.textContent = placeholder;
        return DecorationSet.create(state.doc, [Decoration.widget(1, placeholderEl)]);
      },
    },
  });
}
