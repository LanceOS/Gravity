import { Node as ProseMirrorNode, MarkType } from 'prosemirror-model';
import { EditorState, type Command } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { setBlockType, lift, wrapIn, toggleMark } from 'prosemirror-commands';
import { liftListItem, wrapInList } from 'prosemirror-schema-list';
import { inputRules, textblockTypeInputRule, wrappingInputRule, InputRule } from 'prosemirror-inputrules';
import { richTextSchema } from '../../../utilities/richtext';

export function isSameNodeTypeActive(state: EditorState, nodeTypeName: string, attrs?: Record<string, unknown>) {
  const { $from, $to } = state.selection;
  const range = $from.blockRange($to);
  if (!range) {
    return false;
  }

  for (let depth = range.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name !== nodeTypeName) {
      continue;
    }

    if (!attrs) {
      return true;
    }

    return Object.entries(attrs).every(([key, value]) => node.attrs[key] === value);
  }

  return false;
}

export function isMarkActive(state: EditorState, markName: string) {
  const markType = richTextSchema.marks[markName];
  if (!markType) {
    return false;
  }

  const { empty, from, to, $from } = state.selection;
  if (empty) {
    return Boolean(markType.isInSet(state.storedMarks || $from.marks()));
  }

  return state.doc.rangeHasMark(from, to, markType);
}

export function inlineMarkInputRule(regexp: RegExp, markType: MarkType, delimiterLength: number, getAttrs?: any): InputRule {
  return new InputRule(regexp, (state, match, start, end) => {
    const attrs = getAttrs instanceof Function ? getAttrs(match) : getAttrs;
    const { tr } = state;
    
    const content = match[1];
    if (content) {
      const fullMatch = match[0];
      const contentIndex = fullMatch.indexOf(content);
      if (contentIndex === -1) return null;
      
      const prefixLength = contentIndex - delimiterLength;
      const replaceStart = start + prefixLength;
      const replaceEnd = end;
      
      const mark = markType.create(attrs);
      const textNode = state.schema.text(content, [mark]);
      
      tr.replaceWith(replaceStart, replaceEnd, textNode);
      tr.removeStoredMark(markType);
      
      return tr;
    }
    return null;
  });
}

export function buildInputRules() {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^(#{1,6})\s$/, richTextSchema.nodes.heading, (match) => ({
        level: match[1].length,
      })),
      wrappingInputRule(/^\s*>\s$/, richTextSchema.nodes.blockquote),
      wrappingInputRule(/^\s*([-+*])\s$/, richTextSchema.nodes.bullet_list),
      wrappingInputRule(/^(\d+)\.\s$/, richTextSchema.nodes.ordered_list, (match) => ({
        order: Number(match[1]) || 1,
      })),
      // Inline formatting input rules
      inlineMarkInputRule(/(?:\*\*|__)([^*_]+)(?:\*\*|__)$/, richTextSchema.marks.strong, 2),
      inlineMarkInputRule(/(?:^|[^*_])(?:\*|_)([^*_]+)(?:\*|_)$/, richTextSchema.marks.em, 1),
      inlineMarkInputRule(/(?:^|[^`])(?:\`)([^`]+)(?:\`)$/, richTextSchema.marks.code, 1),
    ],
  });
}

export function toggleHeading(level: number): Command {
  return (state, dispatch) => {
    if (isSameNodeTypeActive(state, 'heading', { level })) {
      return setBlockType(richTextSchema.nodes.paragraph)(state, dispatch);
    }

    return setBlockType(richTextSchema.nodes.heading, { level })(state, dispatch);
  };
}

export function toggleBlockQuote(): Command {
  return (state, dispatch) => {
    if (isSameNodeTypeActive(state, 'blockquote')) {
      return lift(state, dispatch);
    }

    return wrapIn(richTextSchema.nodes.blockquote)(state, dispatch);
  };
}

export function toggleList(listTypeName: 'bullet_list' | 'ordered_list'): Command {
  return (state, dispatch) => {
    if (isSameNodeTypeActive(state, listTypeName)) {
      return liftListItem(richTextSchema.nodes.list_item)(state, dispatch);
    }

    return wrapInList(richTextSchema.nodes[listTypeName])(state, dispatch);
  };
}

export function toggleCodeBlock(): Command {
  return (state, dispatch) => {
    if (isSameNodeTypeActive(state, 'code_block')) {
      return setBlockType(richTextSchema.nodes.paragraph)(state, dispatch);
    }

    return setBlockType(richTextSchema.nodes.code_block)(state, dispatch);
  };
}

export function toggleLink(): Command {
  return (state, dispatch) => {
    const linkType = richTextSchema.marks.link;
    if (!linkType) {
      return false;
    }

    const href = window.prompt('Enter link URL', 'https://');
    if (!href) {
      return false;
    }

    return toggleMark(linkType, { href, title: null })(state, dispatch);
  };
}

export function runEditorCommand(view: EditorView | null | undefined, command: Command) {
  if (!view) {
    return;
  }

  command(view.state, view.dispatch);
  view.focus();
}
