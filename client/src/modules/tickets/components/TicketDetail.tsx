import React, { useState, useCallback } from 'react';
import type { Ticket } from '../../../context/TicketContext';
import { Button, Select, TextInput, Textarea, EditInPlace } from '@library';
import { ClickAwayListener, Portal } from '@library';
import { 
  CheckSquare, GitPullRequest, GitMerge, Send, Trash2,
  Plus, Edit3, ChevronLeft, MoreHorizontal, Link, FileText
} from 'lucide-react';
import { MarkdownContent } from './MarkdownContent';
import type { TicketDetailProps } from '../types/TicketDetail';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../utils/TicketDetail';

export const TicketDetail: React.FC<TicketDetailProps> = ({
  activeTicket,
  comments,
  subtasks,
  completedSubtasks,
  subtaskProgressPercent,
  users,
  projects,
  domains,
  cycles,
  onSelectTicket,
  onUpdateTicket,
  onDeleteTicket,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClose,
  onOpenCreateSubtask,
}) => {
  const [commentInput, setCommentInput] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const [openMenuCommentId, setOpenMenuCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState<string>('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const closeCommentMenu = useCallback(() => setOpenMenuCommentId(null), []);

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (commentInput.trim()) {
      onAddComment(activeTicket.id, commentInput.trim());
      setCommentInput('');
    }
  };

  const handleDelete = () => {
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    await onDeleteTicket(activeTicket.id);
    setIsDeleteConfirmOpen(false);
  };

  const assigneeOptions = [{ value: '', label: 'Unassigned' }, ...users.map((user) => ({ value: user.id, label: user.name }))];
  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  const domainOptions = [{ value: '', label: 'No Domain' }, ...domains.map((domain) => ({ value: domain.id, label: domain.name }))];
  const cycleOptions = [{ value: '', label: 'No Cycle' }, ...cycles.map((cycle) => ({ value: cycle.id, label: cycle.name }))];

  return (
    <>
      <div 
        style={{
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          flex: 1,
          background: 'var(--color-surface-app)',
          overflow: 'hidden'
        }}
      >
      {/* Top Header Navigation */}
      <div 
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--color-border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--color-base50)'
        }}
      >
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          style={{
            color: 'var(--color-text-secondary)',
            padding: '4px 6px',
            border: 'none',
            minHeight: '28px',
            fontSize: '13px'
          }}
        >
          <ChevronLeft size={16} />
          <span>Back</span>
        </Button>

        <span style={{ color: 'var(--color-text-disabled)' }}>/</span>
        
        <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
          {activeTicket.key}
        </span>

        {/* Delete button */}
        <Button
          onClick={handleDelete}
          variant="danger"
          size="sm"
          style={{
            marginLeft: 'auto',
            fontSize: '12px',
            opacity: 0.9
          }}
        >
          <Trash2 size={14} />
          <span>Delete Ticket</span>
        </Button>
      </div>

      {/* Main Details Panel Layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        
        {/* Left Side: Title, Desc, Subtasks, Comments */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
          
          {/* Title Area */}
          <div>
            <EditInPlace
              value={activeTicket.title}
              onSave={(newTitle) => onUpdateTicket(activeTicket.id, { title: newTitle })}
              saveHint="Esc"
              saveOnEnter={false}
              hideSaveButton={true}
              containerClass="editable-seamless"
              inputStyle={{ 
                fontSize: '22px', 
                fontWeight: 600, 
                padding: 0, 
                minHeight: 0,
                lineHeight: 1.2,
                color: 'var(--color-text-primary)'
              }}
              renderDisplay={(val) => (
                <h1 style={{ fontSize: '22px', fontWeight: 600, color: 'var(--color-text-primary)', margin: 0, flex: 1, minWidth: 0, lineHeight: 1.2 }}>
                  {val}
                </h1>
              )}
            />
          </div>

          {/* Description Area */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>Description</span>
            </div>

            <EditInPlace
              value={activeTicket.description || ''}
              onSave={(newDesc) => onUpdateTicket(activeTicket.id, { description: newDesc })}
              saveHint="Esc"
              saveOnEnter={false}
              placeholder="Describe your issue using markdown..."
              emptyText="No description provided. Click to add details..."
              containerClass="markdown-content editable-seamless"
              containerStyle={{ fontSize: '13px', lineHeight: '1.6', minHeight: '60px', paddingRight: '104px', position: 'relative' }}
              inputStyle={{ fontFamily: 'var(--mono)', fontSize: '13px', lineHeight: '1.6', padding: 0, color: 'var(--color-text-primary)' }}
              renderDisplay={(val) => <MarkdownContent text={val} />}
            />
          </div>

          {/* Sub-tickets / Checklist Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>
                Sub-tasks Checklist
              </span>
              
              <Button
                onClick={() => onOpenCreateSubtask(activeTicket.id)}
                variant="ghost"
                size="sm"
                style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
              >
                <Plus size={12} />
                <span>Add Subtask</span>
              </Button>
            </div>

            {subtasks.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                
                {/* Progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, height: '4px', background: 'var(--color-border-default)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${subtaskProgressPercent}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s ease' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)', whiteSpace: 'nowrap' }}>
                    {completedSubtasks} of {subtasks.length} ({Math.round(subtaskProgressPercent)}%)
                  </span>
                </div>

                {/* Subtask rows */}
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--color-border-default)', borderRadius: '6px', overflow: 'hidden' }}>
                  {subtasks.map(sub => (
                    <div 
                      key={sub.id} 
                      onClick={() => onSelectTicket(sub)}
                      className="clickable"
                      style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '12px', 
                        padding: '8px 12px', 
                        background: 'var(--color-surface-card)',
                        borderBottom: '1px solid var(--color-border-default)'
                      }}
                    >
                      <CheckSquare size={14} color={sub.status === 'done' ? 'var(--color-primary)' : 'var(--color-text-disabled)'} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--color-text-disabled)' }}>{sub.key}</span>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)', textDecoration: sub.status === 'done' ? 'line-through' : 'none' }}>{sub.title}</span>
                      
                      <span 
                        style={{ 
                          marginLeft: 'auto', 
                          fontSize: '10px', 
                          padding: '1px 5px', 
                          borderRadius: '4px', 
                          background: 'var(--color-border-default)', 
                          color: 'var(--color-text-primary)' 
                        }}
                      >
                        {sub.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>

              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', fontStyle: 'italic', padding: '8px 4px' }}>
                No sub-tasks defined. Break complex tasks down to improve trackability.
              </div>
            )}
          </div>

          {/* Comments Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <div style={{ borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>
                Activity Thread ({comments.length})
              </span>
            </div>

            {/* Comments List */}
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
                          {new Date(comment.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Comment options dropdown */}
                      <ClickAwayListener onClickAway={closeCommentMenu} active={openMenuCommentId === comment.id}>
                        <div style={{ position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => setOpenMenuCommentId(openMenuCommentId === comment.id ? null : comment.id)}
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
                              {/* Edit */}
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

                              {/* Copy Link */}
                              <button
                                type="button"
                                onClick={() => {
                                  const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
                                  navigator.clipboard.writeText(url);
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

                              {/* Copy Markdown */}
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(comment.body);
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

                              {/* Divider */}
                              <div style={{ height: '1px', background: 'var(--color-border-default)', margin: '3px 6px' }} />

                              {/* Delete */}
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
                          <Textarea
                            value={editingCommentBody}
                            onChange={(e) => setEditingCommentBody(e.target.value)}
                            style={{ fontSize: '13px', lineHeight: '1.5', fontFamily: 'inherit' }}
                            autoGrow
                            autoFocus
                          />
                          <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end' }}>
                            <Button
                              onClick={async () => {
                                if (editingCommentBody.trim()) {
                                  await onUpdateComment(activeTicket.id, comment.id, editingCommentBody.trim());
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

            {/* Post comment form */}
            <form onSubmit={handlePostComment} style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', marginTop: '12px', width: '100%' }}>
              <Textarea 
                placeholder="Post updates, links, or mention PRs..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
                style={{ flex: 1 }}
                autoGrow
              />
              <Button
                type="submit" 
                variant="primary"
                style={{ padding: '8px 16px', height: '34px' }}
              >
                <Send size={12} />
                <span>Comment</span>
              </Button>
            </form>

          </div>

        </div>

        {/* Right Side: Attributes Selectors Panel (takes 280px width) */}
        <div 
          style={{
            width: '280px',
            borderLeft: '1px solid var(--color-border-default)',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            background: 'var(--color-base50)',
            overflowY: 'auto'
          }}
        >
          {/* Ticket Key Display */}
          <div style={{ borderBottom: '1px solid var(--color-border-default)', paddingBottom: '12px', marginBottom: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>
              Ticket Key
            </span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '18px', fontWeight: 700, color: 'var(--color-primary)' }}>
              {activeTicket.key}
            </span>
          </div>
          
          {/* Status */}
          <div>
            <span className="label">Status</span>
            <Select
              value={activeTicket.status}
              onValueChange={(nextStatus: string) => onUpdateTicket(activeTicket.id, { status: nextStatus as Ticket['status'] })}
              options={STATUS_OPTIONS}
              aria-label="Select ticket status"
            />
          </div>

          {/* Priority */}
          <div>
            <span className="label">Priority</span>
            <Select
              value={activeTicket.priority}
              onValueChange={(nextPriority: string) => onUpdateTicket(activeTicket.id, { priority: nextPriority as Ticket['priority'] })}
              options={PRIORITY_OPTIONS}
              aria-label="Select ticket priority"
            />
          </div>

          {/* Assignee */}
          <div>
            <span className="label">Assignee</span>
            <Select
              value={activeTicket.assigneeId || ''}
              onValueChange={(nextAssigneeId: string) => onUpdateTicket(activeTicket.id, { assigneeId: nextAssigneeId || null })}
              options={assigneeOptions}
              aria-label="Select ticket assignee"
            />
          </div>

          {/* Project */}
          <div>
            <span className="label">Project</span>
            <Select
              value={activeTicket.projectId}
              options={projectOptions}
              aria-label="Select ticket project"
              disabled
            />
            <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-disabled)', lineHeight: '1.4' }}>
              Project moves are managed outside ticket details to keep ticket keys and related project data consistent.
            </div>
          </div>

          {/* Domain */}
          <div>
            <span className="label">Domain</span>
            <Select
              value={activeTicket.domainId || ''}
              onValueChange={(nextDomainId: string) => onUpdateTicket(activeTicket.id, { domainId: nextDomainId || null })}
              options={domainOptions}
              aria-label="Select ticket domain"
            />
          </div>

          {/* Cycle */}
          <div>
            <span className="label">Cycle / Milestone</span>
            <Select
              value={activeTicket.cycleId || ''}
              onValueChange={(nextCycleId: string) => onUpdateTicket(activeTicket.id, { cycleId: nextCycleId || null })}
              options={cycleOptions}
              aria-label="Select ticket cycle"
            />
          </div>

          {/* GitHub PR Integration badge indicator */}
          <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: '16px', marginTop: '8px' }}>
            <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <GitPullRequest size={12} />
              <span>GitHub Connection</span>
            </span>

            {activeTicket.prStatus !== 'none' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
                <a 
                  href={activeTicket.prUrl || '#'} 
                  target="_blank" 
                  rel="noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px',
                    borderRadius: '6px',
                    background: activeTicket.prStatus === 'merged' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
                    border: `1px solid ${activeTicket.prStatus === 'merged' ? '#10b981' : '#3b82f6'}30`,
                    color: activeTicket.prStatus === 'merged' ? '#10b981' : '#3b82f6',
                    textDecoration: 'none',
                    fontWeight: 500,
                    fontSize: '12px'
                  }}
                  className="clickable"
                >
                  {activeTicket.prStatus === 'merged' ? <GitMerge size={14} /> : <GitPullRequest size={14} />}
                  <span>PR Status: {activeTicket.prStatus.toUpperCase()}</span>
                </a>
                <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)', textAlign: 'center' }}>
                  Auto-updated via webhook hooks
                </span>
              </div>
            ) : (
              <div 
                style={{ 
                  fontSize: '11px', 
                  color: 'var(--color-text-disabled)', 
                  background: 'rgba(255,255,255,0.01)', 
                  border: '1px dashed var(--color-border-default)',
                  borderRadius: '6px',
                  padding: '10px',
                  marginTop: '6px',
                  lineHeight: '1.4'
                }}
              >
                No PR linked. Mention key <strong>{activeTicket.key}</strong> in PR title or branch (e.g. <code>feature/{activeTicket.key}-auth</code>) to link automatically.
              </div>
            )}
          </div>

        </div>

      </div>

      </div>

      {isDeleteConfirmOpen && (
        <Portal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 950,
            }}
            className="lib-animate-fade-in"
          >
            <div
              style={{
                width: '360px',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-error)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-xl)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Danger zone header stripe */}
              <div style={{ background: 'var(--color-bg-error)', borderBottom: '1px solid var(--color-border-error)', padding: '16px 20px 14px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>
                  Delete {activeTicket.key}?
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-disabled)', lineHeight: '1.5' }}>
                  This removes the ticket and all its activity. This action cannot be undone.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px' }}>
                <Button onClick={() => setIsDeleteConfirmOpen(false)} size="sm">
                  Cancel
                </Button>
                <Button onClick={() => void confirmDelete()} variant="danger" size="sm">
                  Delete Ticket
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {deletingCommentId && (
        <Portal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 950,
            }}
            className="lib-animate-fade-in"
          >
            <div
              style={{
                width: '360px',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-error)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-xl)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* Danger zone header stripe */}
              <div style={{ background: 'var(--color-bg-error)', borderBottom: '1px solid var(--color-border-error)', padding: '16px 20px 14px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>
                  Delete this comment?
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-disabled)', lineHeight: '1.5' }}>
                  This will permanently remove the comment from the activity thread.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px' }}>
                <Button onClick={() => setDeletingCommentId(null)} size="sm">
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    await onDeleteComment(activeTicket.id, deletingCommentId);
                    setDeletingCommentId(null);
                  }}
                  variant="danger"
                  size="sm"
                >
                  Delete Comment
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}


    </>
  );
};
