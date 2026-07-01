import React, { useState, useCallback } from 'react';
import type { Comment, Ticket } from '../../../../../context/TicketContextContext';
import {
  Button,
  ClickAwayListener,
  createEmptyRichTextValue,
  isRichTextEmpty,
  serializeRichTextMarkdown,
} from '@library';
import { MarkdownContent } from '../../MarkdownContent';
import { CommentEditor } from '../../CommentEditor/CommentEditor';
import { ConfirmDialog } from '../../../../../components/ConfirmDialog';
import { Send, Trash2, Edit3, MoreHorizontal, Link, FileText } from 'lucide-react';
import { formatTicketDateTime } from '../../../utils/ticketDateFormatter';

interface TicketCommentsThreadProps {
  activeTicket: Ticket;
  comments: Comment[];
  onAddComment: (ticketId: string, commentInput: string) => void;
  onUpdateComment: (ticketId: string, commentId: string, commentInput: string) => void;
  onDeleteComment: (ticketId: string, commentId: string) => void;
  copyToClipboard: (value: string, successMessage?: string) => Promise<void>;
}

function TicketCommentForm({
  ticketId,
  onAddComment,
}: {
  ticketId: string;
  onAddComment: (ticketId: string, commentInput: string) => void;
}) {
  const [commentInput, setCommentInput] = useState(createEmptyRichTextValue());

  const handlePostComment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isRichTextEmpty(commentInput)) {
      onAddComment(ticketId, commentInput);
      setCommentInput(createEmptyRichTextValue());
    }
  };

  return (
    <form onSubmit={handlePostComment} className="ticket-detail__comment-form">
      <CommentEditor
        placeholder="Post updates, links, or mention PRs..."
        value={commentInput}
        onChange={setCommentInput}
        className="ticket-detail__comment-editor"
      />
      <Button
        type="submit"
        variant="primary"
      >
        <Send size={12} />
        <span>Comment</span>
      </Button>
    </form>
  );
}

export const TicketCommentsThread: React.FC<TicketCommentsThreadProps> = ({
  activeTicket,
  comments,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  copyToClipboard,
}) => {
  const [openMenuCommentId, setOpenMenuCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState<string>('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const closeCommentMenu = useCallback(() => setOpenMenuCommentId(null), []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
      <div style={{ borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>
          Activity Thread ({comments.length})
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {comments.map((comment) => (
          <div key={comment.id} id={`comment-${comment.id}`} style={{ display: 'flex', gap: '12px' }}>
            <img
              src={comment.userAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=guest'}
              alt={comment.userName}
              style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--color-border-default)' }}
            />

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{comment.userName || 'Member'}</span>
                  <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>
                    {formatTicketDateTime(comment.createdAt)}
                  </span>
                </div>

                <ClickAwayListener onClickAway={closeCommentMenu} active={openMenuCommentId === comment.id}>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      onClick={() => setOpenMenuCommentId((previous) => (previous === comment.id ? null : comment.id))}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: openMenuCommentId === comment.id ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)',
                        cursor: 'pointer',
                        display: 'flex',
                        padding: '4px',
                        borderRadius: 'var(--radius-xs)',
                        transition: 'color var(--transition-fast), background var(--transition-fast)'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'var(--color-base100)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = openMenuCommentId === comment.id ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)'; e.currentTarget.style.background = 'none'; }}
                      aria-label="Comment options"
                    >
                      <MoreHorizontal size={14} />
                    </button>

                    {openMenuCommentId === comment.id && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 'calc(100% + 4px)',
                          right: 0,
                          zIndex: 200,
                          minWidth: '172px',
                          background: 'var(--color-surface-card)',
                          border: '1px solid var(--color-border-default)',
                          borderRadius: 'var(--radius-sm)',
                          boxShadow: 'var(--shadow-lg)',
                          padding: '4px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '1px',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCommentId(comment.id);
                            setEditingCommentBody(comment.body);
                            setOpenMenuCommentId(null);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            width: '100%', padding: '7px 10px',
                            background: 'none', border: 'none',
                            borderRadius: 'var(--radius-xs)',
                            color: 'var(--color-text-secondary)', cursor: 'pointer',
                            textAlign: 'left', fontSize: '12px',
                            transition: 'background var(--transition-fast)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-base100)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <Edit3 size={13} style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }} />
                          <span>Edit Comment</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
                            void copyToClipboard(url, 'Comment link copied');
                            setOpenMenuCommentId(null);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            width: '100%', padding: '7px 10px',
                            background: 'none', border: 'none',
                            borderRadius: 'var(--radius-xs)',
                            color: 'var(--color-text-secondary)', cursor: 'pointer',
                            textAlign: 'left', fontSize: '12px',
                            transition: 'background var(--transition-fast)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-base100)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <Link size={13} style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }} />
                          <span>Grab Link</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            void copyToClipboard(serializeRichTextMarkdown(comment.body), 'Comment copied');
                            setOpenMenuCommentId(null);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            width: '100%', padding: '7px 10px',
                            background: 'none', border: 'none',
                            borderRadius: 'var(--radius-xs)',
                            color: 'var(--color-text-secondary)', cursor: 'pointer',
                            textAlign: 'left', fontSize: '12px',
                            transition: 'background var(--transition-fast)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-base100)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <FileText size={13} style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }} />
                          <span>Copy Markdown</span>
                        </button>

                        <div style={{ height: '1px', background: 'var(--color-border-default)', margin: '3px 6px' }} />

                        <button
                          type="button"
                          onClick={() => {
                            setDeletingCommentId(comment.id);
                            setOpenMenuCommentId(null);
                          }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            width: '100%', padding: '7px 10px',
                            background: 'none', border: 'none',
                            borderRadius: 'var(--radius-xs)',
                            color: 'var(--color-error)', cursor: 'pointer',
                            textAlign: 'left', fontSize: '12px',
                            transition: 'background var(--transition-fast)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-error)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                        >
                          <Trash2 size={13} style={{ flexShrink: 0 }} />
                          <span>Delete Comment</span>
                        </button>
                      </div>
                    )}
                  </div>
                </ClickAwayListener>
              </div>

              <div
                style={{
                  fontSize: '13px',
                  color: 'var(--color-text-secondary)',
                  background: 'var(--color-surface-card)',
                  border: '1px solid var(--color-border-default)',
                  borderRadius: '6px',
                  padding: '10px 14px',
                  lineHeight: '1.5'
                }}
              >
                {editingCommentId === comment.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                    <CommentEditor
                      value={editingCommentBody}
                      onChange={setEditingCommentBody}
                      placeholder="Edit comment..."
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end' }}>
                      <Button
                        onClick={async () => {
                          if (!isRichTextEmpty(editingCommentBody)) {
                            await onUpdateComment(activeTicket.id, comment.id, editingCommentBody);
                            setEditingCommentId(null);
                          }
                        }}
                        variant="primary"
                        size="sm"
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                      >
                        Save
                      </Button>
                      <Button
                        onClick={() => setEditingCommentId(null)}
                        size="sm"
                        style={{ padding: '2px 8px', fontSize: '11px' }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <MarkdownContent text={comment.body} />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <TicketCommentForm
        ticketId={activeTicket.id}
        onAddComment={onAddComment}
      />

      {deletingCommentId && (
        <ConfirmDialog.Root isOpen={!!deletingCommentId} onClose={() => setDeletingCommentId(null)}>
          <ConfirmDialog.Header
            title="Delete this comment?"
            description="This will permanently remove the comment from the activity thread."
          />
          <ConfirmDialog.Actions
            cancelLabel="Cancel"
            confirmLabel="Delete Comment"
            onCancel={() => setDeletingCommentId(null)}
            onConfirm={async () => {
              await onDeleteComment(activeTicket.id, deletingCommentId);
              setDeletingCommentId(null);
            }}
          />
        </ConfirmDialog.Root>
      )}
    </div>
  );
};
