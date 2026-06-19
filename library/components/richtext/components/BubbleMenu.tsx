import React, { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Bold, Code2, Heading1, Heading2, Italic, Link2, List, ListOrdered } from 'lucide-react';
import { toggleMark } from 'prosemirror-commands';
import { richTextSchema } from '../../../utilities/richtext';
import { cn } from '../../../utilities/cn';
import { isMarkActive, isSameNodeTypeActive, runEditorCommand, toggleHeading, toggleList, toggleLink } from '../utilities/commands';
import { useEditorContext } from '../context/EditorContext';

function FormattingButton({
  label,
  title,
  icon,
  onClick,
  active = false,
  disabled = false,
}: {
  label: string;
  title: string;
  icon: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      key={label}
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      className={cn('bubble-menu-btn', active && 'is-active')}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
    >
      {icon}
    </button>
  );
}

export function BubbleMenu() {
  const { view, state, readOnly, toolbarMode } = useEditorContext();
  const bubbleMenuRef = useRef<HTMLDivElement | null>(null);
  const [bubbleMenuStyle, setBubbleMenuStyle] = useState<{ left: number; top: number; placeBelow: boolean } | null>(null);

  const selectionKey = state ? `${state.selection.from}:${state.selection.to}:${state.selection.empty}` : 'no-selection';

  useLayoutEffect(() => {
    if (!view || toolbarMode !== 'bubble' || readOnly) {
      setBubbleMenuStyle(null);
      return;
    }

    const selection = view.state.selection;
    if (selection.empty) {
      setBubbleMenuStyle(null);
      return;
    }

    const updateBubblePosition = () => {
      if (view.state.selection.empty) {
        setBubbleMenuStyle(null);
        return;
      }

      try {
        const currentSelection = view.state.selection;
        const fromCoords = view.coordsAtPos(currentSelection.from);
        const toCoords = view.coordsAtPos(currentSelection.to);
        const centerX = (fromCoords.left + toCoords.right) / 2;
        const selectionTop = Math.min(fromCoords.top, toCoords.top);
        const selectionBottom = Math.max(fromCoords.bottom, toCoords.bottom);
        const placeBelow = selectionTop < 56;

        setBubbleMenuStyle({
          left: Math.max(16, Math.min(centerX, window.innerWidth - 16)),
          top: Math.max(16, placeBelow ? selectionBottom + 10 : selectionTop - 10),
          placeBelow,
        });
      } catch {
        setBubbleMenuStyle(null);
      }
    };

    updateBubblePosition();
    window.addEventListener('resize', updateBubblePosition);
    window.addEventListener('scroll', updateBubblePosition, true);

    return () => {
      window.removeEventListener('resize', updateBubblePosition);
      window.removeEventListener('scroll', updateBubblePosition, true);
    };
  }, [readOnly, selectionKey, toolbarMode, view]);

  if (toolbarMode !== 'bubble' || !bubbleMenuStyle || !state || !view) {
    return null;
  }

  const boldActive = isMarkActive(state, 'strong');
  const italicActive = isMarkActive(state, 'em');
  const codeActive = isMarkActive(state, 'code');
  const linkActive = isMarkActive(state, 'link');
  const h1Active = isSameNodeTypeActive(state, 'heading', { level: 1 });
  const h2Active = isSameNodeTypeActive(state, 'heading', { level: 2 });
  const bulletActive = isSameNodeTypeActive(state, 'bullet_list');
  const orderedActive = isSameNodeTypeActive(state, 'ordered_list');

  return (
    <div
      ref={bubbleMenuRef}
      className="markdown-bubble-menu"
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      style={{
        left: `${bubbleMenuStyle.left}px`,
        top: `${bubbleMenuStyle.top}px`,
        transform: bubbleMenuStyle.placeBelow ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
      }}
    >
      <FormattingButton label="bubble-bold" title="Bold" icon={<Bold size={14} />} active={boldActive} disabled={readOnly} onClick={() => {
        runEditorCommand(view, toggleMark(richTextSchema.marks.strong));
      }} />
      <FormattingButton label="bubble-italic" title="Italic" icon={<Italic size={14} />} active={italicActive} disabled={readOnly} onClick={() => {
        runEditorCommand(view, toggleMark(richTextSchema.marks.em));
      }} />
      <FormattingButton label="bubble-link" title="Link" icon={<Link2 size={14} />} active={linkActive} disabled={readOnly} onClick={() => {
        runEditorCommand(view, toggleLink());
      }} />
      <FormattingButton label="bubble-code" title="Inline code" icon={<Code2 size={14} />} active={codeActive} disabled={readOnly} onClick={() => {
        runEditorCommand(view, toggleMark(richTextSchema.marks.code));
      }} />
      <FormattingButton label="bubble-h1" title="Heading 1" icon={<Heading1 size={14} />} active={h1Active} disabled={readOnly} onClick={() => {
        runEditorCommand(view, toggleHeading(1));
      }} />
      <FormattingButton label="bubble-h2" title="Heading 2" icon={<Heading2 size={14} />} active={h2Active} disabled={readOnly} onClick={() => {
        runEditorCommand(view, toggleHeading(2));
      }} />
      <FormattingButton label="bubble-bullet-list" title="Bullet list" icon={<List size={14} />} active={bulletActive} disabled={readOnly} onClick={() => {
        runEditorCommand(view, toggleList('bullet_list'));
      }} />
      <FormattingButton label="bubble-ordered-list" title="Numbered list" icon={<ListOrdered size={14} />} active={orderedActive} disabled={readOnly} onClick={() => {
        runEditorCommand(view, toggleList('ordered_list'));
      }} />
    </div>
  );
}
