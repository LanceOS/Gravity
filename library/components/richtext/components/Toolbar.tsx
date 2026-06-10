import { ReactNode } from 'react';
import { Bold, Code2, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Undo2 } from 'lucide-react';
import { redo, redoDepth, undo, undoDepth } from 'prosemirror-history';
import { toggleMark } from 'prosemirror-commands';
import { richTextSchema } from '../../../utilities/richtext';
import { cn } from '../../../utilities/cn';
import { isMarkActive, isSameNodeTypeActive, runEditorCommand, toggleHeading, toggleList, toggleBlockQuote, toggleCodeBlock, toggleLink } from '../utilities/commands';
import { useEditorContext } from '../context/EditorContext';

function FormattingButton({
  label,
  title,
  icon,
  onClick,
  active = false,
  disabled = false,
  variant = 'toolbar'
}: {
  label: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  variant?: 'toolbar' | 'bubble';
}) {
  const buttonClassName = variant === 'bubble'
    ? cn('bubble-menu-btn', active && 'is-active')
    : cn('rich-text-editor__button', active && 'rich-text-editor__button--active');

  return (
    <button
      key={label}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={buttonClassName}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

export function Toolbar() {
  const { view, state, readOnly } = useEditorContext();

  if (!view || !state) return null;

  const boldActive = isMarkActive(state, 'strong');
  const italicActive = isMarkActive(state, 'em');
  const codeActive = isMarkActive(state, 'code');
  const linkActive = isMarkActive(state, 'link');
  const h1Active = isSameNodeTypeActive(state, 'heading', { level: 1 });
  const h2Active = isSameNodeTypeActive(state, 'heading', { level: 2 });
  const h3Active = isSameNodeTypeActive(state, 'heading', { level: 3 });
  const bulletActive = isSameNodeTypeActive(state, 'bullet_list');
  const orderedActive = isSameNodeTypeActive(state, 'ordered_list');
  const quoteActive = isSameNodeTypeActive(state, 'blockquote');
  const blockCodeActive = isSameNodeTypeActive(state, 'code_block');

  return (
    <div className="rich-text-editor__toolbar" role="toolbar" aria-label="Text formatting">
      <div className="rich-text-editor__group">
        <FormattingButton label="bold" title="Bold" icon={<Bold size={14} />} active={boldActive} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleMark(richTextSchema.marks.strong));
        }} />
        <FormattingButton label="italic" title="Italic" icon={<Italic size={14} />} active={italicActive} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleMark(richTextSchema.marks.em));
        }} />
        <FormattingButton label="code" title="Inline code" icon={<Code2 size={14} />} active={codeActive} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleMark(richTextSchema.marks.code));
        }} />
      </div>

      <div className="rich-text-editor__group">
        <FormattingButton label="h1" title="Heading 1" icon={<Heading1 size={14} />} active={h1Active} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleHeading(1));
        }} />
        <FormattingButton label="h2" title="Heading 2" icon={<Heading2 size={14} />} active={h2Active} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleHeading(2));
        }} />
        <FormattingButton label="h3" title="Heading 3" icon={<Heading3 size={14} />} active={h3Active} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleHeading(3));
        }} />
      </div>

      <div className="rich-text-editor__group">
        <FormattingButton label="bullet-list" title="Bullet list" icon={<List size={14} />} active={bulletActive} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleList('bullet_list'));
        }} />
        <FormattingButton label="ordered-list" title="Numbered list" icon={<ListOrdered size={14} />} active={orderedActive} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleList('ordered_list'));
        }} />
        <FormattingButton label="quote" title="Blockquote" icon={<Quote size={14} />} active={quoteActive} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleBlockQuote());
        }} />
        <FormattingButton label="code-block" title="Code block" icon={<span style={{ fontSize: 12, fontWeight: 700 }}>{'</>'}</span>} active={blockCodeActive} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleCodeBlock());
        }} />
      </div>

      <div className="rich-text-editor__group">
        <FormattingButton label="link" title="Link" icon={<Link2 size={14} />} active={linkActive} disabled={readOnly} onClick={() => {
          runEditorCommand(view, toggleLink());
        }} />
        <FormattingButton label="undo" title="Undo" icon={<Undo2 size={14} />} disabled={readOnly || undoDepth(state) === 0} onClick={() => {
          runEditorCommand(view, undo);
        }} />
        <FormattingButton label="redo" title="Redo" icon={<Redo2 size={14} />} disabled={readOnly || redoDepth(state) === 0} onClick={() => {
          runEditorCommand(view, redo);
        }} />
      </div>
    </div>
  );
}
