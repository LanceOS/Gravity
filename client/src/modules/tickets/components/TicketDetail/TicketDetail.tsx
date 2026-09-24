import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Ticket } from '../../../../context/TicketContextContext';
import {
  Button,
  MarkdownEditor,
  RichTextEditor,
  toast,
  useCopyToClipboard,
  Accordion,
  createEmptyRichTextValue,
  isRichTextEmpty,
} from '@library';
import generateBranchName from '../../../../utils/branch';
import { safeAnime, prefersReducedMotion } from '../../../../utils/animationUtils';
import anime from 'animejs';
import { TicketPropertiesGrid } from './components/TicketPropertiesGrid';
import { TicketSubtasksChecklist } from './components/TicketSubtasksChecklist';
import { TicketCommentsThread } from './components/TicketCommentsThread';
import type { TicketWithRelations } from '../../utils/ticketRelations';
import { buildTicketUrl, parseAllowedTicketHosts, sanitizeTicketUrlBase } from '../../utils/ticketUrl';
import {
  Trash2, Plus, ChevronLeft, CornerLeftUp, Send
} from 'lucide-react';
import type { TicketDetailProps } from '../../types/TicketDetail';
import { TicketContextMenu } from '../TicketContextMenu';
import { WorkspacePageLayout } from '../../../../layouts/WorkspacePageLayout/WorkspacePageLayout';
import { ConfirmDialog } from '../../../../components/ConfirmDialog';
import { useIsMobileTicketLayout } from '../useMobileTicketLayout';
import { CommentEditor } from '../CommentEditor/CommentEditor';
import './TicketDetail.css';

const CLIENT_ENV = typeof import.meta !== 'undefined'
  ? (import.meta as unknown as { env?: Record<string, string | undefined> }).env
  : undefined;
const ALLOWED_TICKET_HOSTS = parseAllowedTicketHosts(CLIENT_ENV?.VITE_ALLOWED_TICKET_HOSTS);
const TICKET_URL_BASE = sanitizeTicketUrlBase(CLIENT_ENV?.VITE_TICKET_URL_BASE, ALLOWED_TICKET_HOSTS);

function TicketDescriptionEditor({ 
  initialDescription, 
  ticketId, 
  onUpdateTicket 
}: { 
  initialDescription: string | null; 
  ticketId: string; 
  onUpdateTicket: (id: string, updates: any) => void; 
}) {
  const [editingDescriptionBody, setEditingDescriptionBody] = useState(() => initialDescription || createEmptyRichTextValue());
  const lastSavedDescriptionRef = useRef(initialDescription);
  const prevDescriptionRef = useRef(initialDescription);
  const descriptionTicketIdRef = useRef(ticketId);

  useEffect(() => {
    const isNewTicket = descriptionTicketIdRef.current !== ticketId;
    const nextDescription = initialDescription || createEmptyRichTextValue();

    if (isNewTicket) {
      descriptionTicketIdRef.current = ticketId;
      setEditingDescriptionBody(nextDescription);
      lastSavedDescriptionRef.current = initialDescription;
      prevDescriptionRef.current = initialDescription;
    } else {
      const wasSavedByUs = initialDescription === lastSavedDescriptionRef.current;
      if (!wasSavedByUs && initialDescription !== prevDescriptionRef.current) {
        setEditingDescriptionBody(nextDescription);
        lastSavedDescriptionRef.current = initialDescription;
        prevDescriptionRef.current = initialDescription;
      } else {
        prevDescriptionRef.current = initialDescription;
      }
    }
  }, [ticketId, initialDescription]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (editingDescriptionBody !== lastSavedDescriptionRef.current) {
        lastSavedDescriptionRef.current = editingDescriptionBody;
        void onUpdateTicket(ticketId, { description: editingDescriptionBody });
      }
    }, 1500);
    return () => clearTimeout(timeoutId);
  }, [editingDescriptionBody, ticketId, onUpdateTicket]);

  const handleDescriptionBlur = useCallback(() => {
    if (editingDescriptionBody !== lastSavedDescriptionRef.current) {
      lastSavedDescriptionRef.current = editingDescriptionBody;
      void onUpdateTicket(ticketId, { description: editingDescriptionBody });
    }
  }, [editingDescriptionBody, ticketId, onUpdateTicket]);

  return (
    <RichTextEditor
      key={`desc-${ticketId}`}
      value={editingDescriptionBody}
      onChange={setEditingDescriptionBody}
      onBlur={handleDescriptionBlur}
      placeholder="Describe your issue..."
      className="ticket-detail__description-editor"
      surface="bare"
      toolbarMode="bubble"
    />
  );
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

export const TicketDetail: React.FC<TicketDetailProps> = ({
  activeTicket,
  activeTicketDetail,
  comments,
  subtasks,
  availableTickets,
  ticketsById,
  completedSubtasks,
  subtaskProgressPercent,
  users,
  projects,
  labels,
  cycles,
  onSelectTicket,
  onSelectLabel,
  onUpdateTicket,
  onDeleteTicket,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClose,
  onOpenCreateSubtask,
  onAddDependency,
  onRemoveDependency,
  onAddBlocker,
  onRemoveBlocker,
  parentTicket,
  ticketLink: customTicketLink,
}) => {
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const isMobileTicketLayout = useIsMobileTicketLayout();
  const userAvatarById = useMemo(() => Object.fromEntries(users.map((user) => [user.id, user.avatar])), [users]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Reset initial state before animating
    anime.set(containerRef.current, { translateX: 30, opacity: 0 });

    safeAnime({
      targets: containerRef.current,
      translateX: [30, 0],
      opacity: [0, 1],
      duration: 350,
      easing: 'easeOutCubic',
    });
  }, [activeTicket.id]);

  const handleClose = useCallback(() => {
    const isTransitionDisabled = prefersReducedMotion() || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test');

    if (isTransitionDisabled || !containerRef.current) {
      if (onClose) onClose();
      else window.history.back();
      return;
    }

    safeAnime({
      targets: containerRef.current,
      translateX: [0, 30],
      opacity: [1, 0],
      duration: 250,
      easing: 'easeInCubic',
      complete: () => {
        if (onClose) onClose();
        else window.history.back();
      }
    });
  }, [onClose]);

  const ticketLink = useMemo(
    () => customTicketLink || buildTicketUrl(TICKET_URL_BASE, activeTicket.key),
    [customTicketLink, activeTicket.key],
  );

  const generatedBranchName = useMemo(
    () => (activeTicket.branchName ? activeTicket.branchName : generateBranchName(activeTicket.key, activeTicket.title)),
    [activeTicket.branchName, activeTicket.key, activeTicket.title]
  );

  const { copy } = useCopyToClipboard();
  const copyToClipboard = useCallback(async (value: string, successMessage?: string) => {
    const success = await copy(value);
    toast.show(success ? successMessage || 'Copied to clipboard' : 'Failed to copy', success ? 'success' : 'error');
    return success;
  }, [copy]);

  const handleCopyBranchName = async () => {
    const copied = await copyToClipboard(generatedBranchName, 'Branch name copied');
    if (!copied || activeTicket.status === 'in_progress') return;

    try {
      await onUpdateTicket(activeTicket.id, { status: 'in_progress' });
    } catch {
      toast.show('Branch name copied, but the ticket could not be moved to In Progress', 'error');
    }
  };

  const handleDelete = () => {
    setIsDeleteConfirmOpen(true);
  };

  const resolvedParentTicket = parentTicket ?? null;
  const resolvedActiveTicketDetail = useMemo<TicketWithRelations | null>(() => {
    if (!activeTicketDetail) {
      return null;
    }

    return {
      ...activeTicketDetail,
      relatedTicketIds: 'relatedTicketIds' in activeTicketDetail ? activeTicketDetail.relatedTicketIds : [],
    } as TicketWithRelations;
  }, [activeTicketDetail]);
  const handleAddBlocker = onAddBlocker ?? (async () => false);
  const handleRemoveBlocker = onRemoveBlocker ?? (async () => false);

  const confirmDelete = async () => {
    await onDeleteTicket(activeTicket.id);
    setIsDeleteConfirmOpen(false);
  };

  const propertiesContent = (
    <TicketPropertiesGrid
      activeTicket={activeTicket}
      activeTicketDetail={resolvedActiveTicketDetail}
      availableTickets={availableTickets}
      ticketsById={ticketsById}
      parentTicket={resolvedParentTicket}
      users={users}
      projects={projects}
      labels={labels}
      cycles={cycles}
      ticketLink={ticketLink}
      onCopyBranchName={handleCopyBranchName}
      onSelectTicket={onSelectTicket}
      onSelectLabel={onSelectLabel}
      onUpdateTicket={onUpdateTicket}
      onAddDependency={onAddDependency}
      onRemoveDependency={onRemoveDependency}
      onAddBlocker={handleAddBlocker}
      onRemoveBlocker={handleRemoveBlocker}
      copyToClipboard={copyToClipboard}
    />
  );
  return (
    <div ref={containerRef} style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column', flex: '1 1 auto', overflow: 'hidden' }}>
      <TicketContextMenu ticket={activeTicket} availableTickets={availableTickets}>
        <WorkspacePageLayout.Shell className="ticket-detail">
          <WorkspacePageLayout.Header className="ticket-detail__header">
            <Button
              onClick={handleClose}
              variant="ghost"
              size="sm"
              className="ticket-detail__back-btn clickable"
            >
              <ChevronLeft size={16} />
              <span className="ticket-detail__back-text">Back</span>
            </Button>

            <span className="ticket-detail__sep">/</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
                {activeTicket.key}
              </span>

              {parentTicket ? (
                <>
                  <span className="ticket-parent-ref">
                    <span className="ticket-parent-label">Sub ticket of</span>
                    <button
                      type="button"
                      onClick={() => onSelectTicket(parentTicket)}
                      className="ticket-parent-btn clickable"
                      aria-label={`${parentTicket.key} - ${parentTicket.title}`}
                    >
                      <span className="ticket-parent-key">{parentTicket.key}</span>
                      <span className="ticket-parent-title">{` - ${parentTicket.title}`}</span>
                    </button>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="ticket-parent-mobile-btn"
                    onClick={() => onSelectTicket(parentTicket)}
                    aria-label={`Parent ticket: ${parentTicket.key}`}
                    style={{ padding: '4px 10px', fontSize: '12.5px', height: '28px' }}
                  >
                    <CornerLeftUp size={14} />
                    <span>Parent</span>
                  </Button>
                </>
              ) : null}
            </div>

            <Button
              onClick={handleDelete}
              variant="danger"
              size="sm"
              className="ticket-detail__delete-btn"
            >
              <Trash2 size={14} />
              <span>Delete Ticket</span>
            </Button>
          </WorkspacePageLayout.Header>

          <WorkspacePageLayout.Content className="ticket-detail__layout" flush>
            <WorkspacePageLayout.Body className="ticket-detail__body">

          <div className="ticket-detail__content">

            <div className="ticket-detail__accordion-mobile">
              <Accordion
                items={[
                  {
                    id: 'ticket-details',
                    title: 'Ticket Details',
                    content: propertiesContent
                  }
                ]}
              />
            </div>

            <div>
              <MarkdownEditor
                value={activeTicket.title}
                onSave={(newTitle) => onUpdateTicket(activeTicket.id, { title: newTitle })}
                singleLine={true}
                minHeight="auto"
                className="ticket-title-editor"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>Description</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <TicketDescriptionEditor
                  initialDescription={activeTicket.description || null}
                  ticketId={activeTicket.id}
                  onUpdateTicket={onUpdateTicket}
                />
              </div>
            </div>

            <TicketSubtasksChecklist
              activeTicket={activeTicket}
              subtasks={subtasks}
              completedSubtasks={completedSubtasks}
              subtaskProgressPercent={subtaskProgressPercent}
              userAvatarById={userAvatarById}
              isMobileTicketLayout={isMobileTicketLayout}
              onSelectTicket={onSelectTicket}
              onOpenCreateSubtask={onOpenCreateSubtask}
            />

            <TicketCommentsThread
              activeTicket={activeTicket}
              comments={comments}
              onAddComment={onAddComment}
              onUpdateComment={onUpdateComment}
              onDeleteComment={onDeleteComment}
              copyToClipboard={copyToClipboard}
            />

          </div>

          <div className="ticket-detail__sidebar" data-testid="desktop-sidebar">
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-disabled)', marginBottom: '16px' }}>
              Properties
            </div>
            {propertiesContent}
          </div>



            </WorkspacePageLayout.Body>
          </WorkspacePageLayout.Content>

        </WorkspacePageLayout.Shell>
      </TicketContextMenu>

      {isDeleteConfirmOpen && (
        <ConfirmDialog.Root isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)}>
          <ConfirmDialog.Header
            title={`Delete ${activeTicket.key}?`}
            description="This removes the ticket and all its activity. This action cannot be undone."
          />
          <ConfirmDialog.Actions
            cancelLabel="Cancel"
            confirmLabel="Delete Ticket"
            onCancel={() => setIsDeleteConfirmOpen(false)}
            onConfirm={confirmDelete}
          />
        </ConfirmDialog.Root>
      )}




    </div>
  );
};
