import React, { useState, useEffect } from 'react';
import type { Comment, Cycle, Domain, Project, Ticket, User } from '../context/TicketContext';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { 
  X, CheckSquare, GitPullRequest, GitMerge, Send, Trash2, 
  Plus, Edit3, Eye, Calendar, User as UserIcon, Folder, Tag, AlertCircle, ChevronLeft
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: 'backlog', label: '📁 Backlog' },
  { value: 'todo', label: '📋 Todo' },
  { value: 'in_progress', label: '⚡ In Progress' },
  { value: 'in_review', label: '🔍 In Review' },
  { value: 'done', label: '✅ Done' },
  { value: 'canceled', label: '❌ Canceled' },
];

const PRIORITY_OPTIONS = [
  { value: 'no_priority', label: '➖ No Priority' },
  { value: 'low', label: '🔵 Low' },
  { value: 'medium', label: '🟡 Medium' },
  { value: 'high', label: '🔴 High' },
  { value: 'urgent', label: '💖 Urgent' },
];

interface TicketDetailProps {
  activeTicket: Ticket;
  comments: Comment[];
  subtasks: Ticket[];
  completedSubtasks: number;
  subtaskProgressPercent: number;
  activeAssignee: User | null;
  activeProject: Project | null;
  activeDomain: Domain | null;
  activeCycle: Cycle | null;
  users: User[];
  projects: Project[];
  domains: Domain[];
  cycles: Cycle[];
  onSelectTicket: (ticket: Ticket | null) => void;
  onUpdateTicket: (id: string, updates: Partial<Ticket>) => Promise<void>;
  onDeleteTicket: (ticketId: string) => Promise<void>;
  onAddComment: (ticketId: string, body: string) => Promise<void>;
  onClose: () => void;
  onOpenCreateSubtask: (parentId: string) => void;
}

export const TicketDetail: React.FC<TicketDetailProps> = ({
  activeTicket,
  comments,
  subtasks,
  completedSubtasks,
  subtaskProgressPercent,
  activeAssignee,
  activeProject,
  activeDomain,
  activeCycle,
  users,
  projects,
  domains,
  cycles,
  onSelectTicket,
  onUpdateTicket,
  onDeleteTicket,
  onAddComment,
  onClose,
  onOpenCreateSubtask,
}) => {
  // Local state for editing fields
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(activeTicket.title);
  
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const [descValue, setDescValue] = useState(activeTicket.description || '');
  const [descTab, setDescTab] = useState<'write' | 'preview'>('preview');

  const [commentInput, setCommentInput] = useState('');
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  // Sync state when active ticket changes
  useEffect(() => {
    setTitleValue(activeTicket.title);
    setDescValue(activeTicket.description || '');
    setIsEditingTitle(false);
    setIsEditingDesc(false);
    setDescTab('preview');
    setCommentInput('');
    setIsDeleteConfirmOpen(false);
  }, [activeTicket]);

  const handleTitleBlur = () => {
    setIsEditingTitle(false);
    if (titleValue.trim() && titleValue !== activeTicket.title) {
      onUpdateTicket(activeTicket.id, { title: titleValue });
    }
  };

  const handleDescSave = () => {
    setIsEditingDesc(false);
    onUpdateTicket(activeTicket.id, { description: descValue });
  };

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

  const handleEditableKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, onActivate: () => void) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onActivate();
    }
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
          background: 'var(--bg)',
          overflow: 'hidden'
        }}
      >
      {/* Top Header Navigation */}
      <div 
        style={{
          padding: '12px 24px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'var(--sidebar-bg)'
        }}
      >
        <Button
          onClick={onClose}
          variant="ghost"
          size="sm"
          style={{
            color: 'var(--text)',
            padding: '4px 6px',
            border: 'none',
            minHeight: '28px',
            fontSize: '13px'
          }}
        >
          <ChevronLeft size={16} />
          <span>Back</span>
        </Button>

        <span style={{ color: 'var(--text-muted)' }}>/</span>
        
        <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
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
            {isEditingTitle ? (
              <input 
                type="text"
                className="input"
                style={{ fontSize: '22px', fontWeight: 600, padding: '6px 10px' }}
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                onBlur={handleTitleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
                autoFocus
              />
            ) : (
              <div
                onClick={() => setIsEditingTitle(true)}
                onKeyDown={(event) => handleEditableKeyDown(event, () => setIsEditingTitle(true))}
                className="editable-display editable-display--title"
                role="button"
                tabIndex={0}
                title="Click to edit title"
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
                  <h1
                    style={{
                      fontSize: '22px',
                      fontWeight: 600,
                      color: 'var(--text-heading)',
                      margin: 0,
                      flex: 1,
                      minWidth: 0
                    }}
                  >
                    {activeTicket.title}
                  </h1>
                  <span className="editable-display__hint" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    <Edit3 size={12} />
                    <span>Edit</span>
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Description Area */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Description</span>
              
              {isEditingDesc ? (
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                  <Button
                    onClick={() => setDescTab('write')}
                    variant={descTab === 'write' ? 'accent' : 'ghost'}
                    size="sm"
                    style={{ padding: '2px 8px', fontSize: '10px' }}
                  >
                    <Edit3 size={10} style={{ marginRight: '4px' }} /> Write
                  </Button>
                  <Button
                    onClick={() => setDescTab('preview')}
                    variant={descTab === 'preview' ? 'accent' : 'ghost'}
                    size="sm"
                    style={{ padding: '2px 8px', fontSize: '10px' }}
                  >
                    <Eye size={10} style={{ marginRight: '4px' }} /> Preview
                  </Button>
                  <Button
                    onClick={handleDescSave}
                    variant="primary"
                    size="sm"
                    style={{ padding: '2px 8px', fontSize: '10px', marginLeft: '8px' }}
                  >
                    Save
                  </Button>
                  <Button
                    onClick={() => { setIsEditingDesc(false); setDescValue(activeTicket.description || ''); }}
                    size="sm"
                    style={{ padding: '2px 8px', fontSize: '10px' }}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => setIsEditingDesc(true)}
                  variant="ghost"
                  size="sm"
                  style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
                >
                  Edit Description
                </Button>
              )}
            </div>

            {isEditingDesc ? (
              descTab === 'write' ? (
                <textarea 
                  className="input"
                  rows={8}
                  style={{ fontFamily: 'var(--mono)', fontSize: '13px', lineHeight: '1.6', resize: 'vertical' }}
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  placeholder="Describe your issue using markdown..."
                  autoFocus
                />
              ) : (
                <div 
                  className="markdown-content"
                  style={{ 
                    border: '1px solid var(--border)', 
                    borderRadius: '6px', 
                    padding: '12px', 
                    minHeight: '160px',
                    fontSize: '13px',
                    background: 'var(--card-bg)'
                  }}
                >
                  {descValue ? <MarkdownMock text={descValue} /> : <span style={{ color: 'var(--text-muted)' }}>Nothing to preview</span>}
                </div>
              )
            ) : (
              <div 
                onClick={() => setIsEditingDesc(true)}
                onKeyDown={(event) => handleEditableKeyDown(event, () => setIsEditingDesc(true))}
                className="markdown-content editable-display editable-display--multiline"
                role="button"
                tabIndex={0}
                style={{ 
                  fontSize: '13px', 
                  lineHeight: '1.6', 
                  minHeight: '60px', 
                  display: 'grid',
                  gap: '8px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'flex-end', minHeight: '18px' }}>
                  <span className="editable-display__hint" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 500 }}>
                    <Edit3 size={12} />
                    <span>Edit description</span>
                  </span>
                </div>
                {activeTicket.description ? (
                  <MarkdownMock text={activeTicket.description} />
                ) : (
                  <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>No description provided. Click to add details...</span>
                )}
              </div>
            )}
          </div>

          {/* Sub-tickets / Checklist Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
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
                  <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
                    <div style={{ width: `${subtaskProgressPercent}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.2s ease' }} />
                  </div>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {completedSubtasks} of {subtasks.length} ({Math.round(subtaskProgressPercent)}%)
                  </span>
                </div>

                {/* Subtask rows */}
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
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
                        background: 'var(--card-bg)',
                        borderBottom: '1px solid var(--border)'
                      }}
                    >
                      <CheckSquare size={14} color={sub.status === 'done' ? 'var(--accent)' : 'var(--text-muted)'} />
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text-muted)' }}>{sub.key}</span>
                      <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-heading)', textDecoration: sub.status === 'done' ? 'line-through' : 'none' }}>{sub.title}</span>
                      
                      <span 
                        style={{ 
                          marginLeft: 'auto', 
                          fontSize: '10px', 
                          padding: '1px 5px', 
                          borderRadius: '4px', 
                          background: 'var(--border)', 
                          color: 'var(--text-heading)' 
                        }}
                      >
                        {sub.status.replace('_', ' ')}
                      </span>
                    </div>
                  ))}
                </div>

              </div>
            ) : (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '8px 4px' }}>
                No sub-tasks defined. Break complex tasks down to improve trackability.
              </div>
            )}
          </div>

          {/* Comments Section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <div style={{ borderBottom: '1px solid var(--border)', paddingBottom: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Activity Thread ({comments.length})
              </span>
            </div>

            {/* Comments List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {comments.map((comment: Comment) => (
                <div key={comment.id} style={{ display: 'flex', gap: '12px' }}>
                  <img 
                    src={comment.userAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=guest'} 
                    alt={comment.userName} 
                    style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--border)' }}
                  />
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-heading)' }}>{comment.userName || 'Member'}</span>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        {new Date(comment.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    
                    <div 
                      style={{ 
                        fontSize: '13px', 
                        color: 'var(--text)', 
                        background: 'rgba(255,255,255,0.01)', 
                        border: '1px solid var(--border)',
                        borderRadius: '6px',
                        padding: '10px 14px',
                        lineHeight: '1.5'
                      }}
                    >
                      <MarkdownMock text={comment.body} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Post comment form */}
            <form onSubmit={handlePostComment} style={{ display: 'flex', gap: '10px', marginTop: '12px' }}>
              <input 
                type="text"
                className="input"
                placeholder="Post updates, links, or mention PRs..."
                value={commentInput}
                onChange={(e) => setCommentInput(e.target.value)}
              />
              <Button
                type="submit" 
                variant="primary"
                style={{ padding: '8px 16px' }}
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
            borderLeft: '1px solid var(--border)',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
            background: 'var(--sidebar-bg)',
            overflowY: 'auto'
          }}
        >
          
          {/* Status */}
          <div>
            <span className="label">Status</span>
            <Select
              value={activeTicket.status}
              onValueChange={(nextStatus) => onUpdateTicket(activeTicket.id, { status: nextStatus as Ticket['status'] })}
              options={STATUS_OPTIONS}
              ariaLabel="Select ticket status"
            />
          </div>

          {/* Priority */}
          <div>
            <span className="label">Priority</span>
            <Select
              value={activeTicket.priority}
              onValueChange={(nextPriority) => onUpdateTicket(activeTicket.id, { priority: nextPriority as Ticket['priority'] })}
              options={PRIORITY_OPTIONS}
              ariaLabel="Select ticket priority"
            />
          </div>

          {/* Assignee */}
          <div>
            <span className="label">Assignee</span>
            <Select
              value={activeTicket.assigneeId || ''}
              onValueChange={(nextAssigneeId) => onUpdateTicket(activeTicket.id, { assigneeId: nextAssigneeId || null })}
              options={assigneeOptions}
              ariaLabel="Select ticket assignee"
            />
          </div>

          {/* Project */}
          <div>
            <span className="label">Project</span>
            <Select
              value={activeTicket.projectId}
              onValueChange={(nextProjectId) => onUpdateTicket(activeTicket.id, { projectId: nextProjectId })}
              options={projectOptions}
              ariaLabel="Select ticket project"
            />
          </div>

          {/* Domain */}
          <div>
            <span className="label">Domain</span>
            <Select
              value={activeTicket.domainId || ''}
              onValueChange={(nextDomainId) => onUpdateTicket(activeTicket.id, { domainId: nextDomainId || null })}
              options={domainOptions}
              ariaLabel="Select ticket domain"
            />
          </div>

          {/* Cycle */}
          <div>
            <span className="label">Cycle / Milestone</span>
            <Select
              value={activeTicket.cycleId || ''}
              onValueChange={(nextCycleId) => onUpdateTicket(activeTicket.id, { cycleId: nextCycleId || null })}
              options={cycleOptions}
              ariaLabel="Select ticket cycle"
            />
          </div>

          {/* GitHub PR Integration badge indicator */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: '8px' }}>
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
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textAlign: 'center' }}>
                  Auto-updated via webhook hooks
                </span>
              </div>
            ) : (
              <div 
                style={{ 
                  fontSize: '11px', 
                  color: 'var(--text-muted)', 
                  background: 'rgba(255,255,255,0.01)', 
                  border: '1px dashed var(--border)',
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
        >
          <div
            style={{
              width: '360px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-heading)' }}>
                Delete {activeTicket.key}?
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                This removes the ticket and its related activity from the current project. This action cannot be undone.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <Button
                onClick={() => setIsDeleteConfirmOpen(false)}
                size="sm"
              >
                Cancel
              </Button>
              <Button
                onClick={() => void confirmDelete()}
                variant="danger"
                size="sm"
              >
                Delete Ticket
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// Extremely simple sub-renderer that parses basic markdown formatting like bold, code, links and linebreaks
const MarkdownMock: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return null;
  
  const lines = text.split('\n');
  return (
    <>
      {lines.map((line, idx) => {
        // Headers
        if (line.startsWith('# ')) {
          return <h2 key={idx} style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-heading)', margin: '12px 0 6px' }}>{line.replace('# ', '')}</h2>;
        }
        if (line.startsWith('## ')) {
          return <h3 key={idx} style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)', margin: '10px 0 4px' }}>{line.replace('## ', '')}</h3>;
        }

        // Bullet point lists
        if (line.trim().startsWith('* ') || line.trim().startsWith('- ')) {
          const content = line.replace(/^\s*[\*\-]\s+/, '');
          return <li key={idx} style={{ marginLeft: '12px', fontSize: '13px', margin: '2px 0' }}><FormattedText text={content} /></li>;
        }

        return (
          <p key={idx} style={{ minHeight: '18px', margin: '4px 0' }}>
            <FormattedText text={line} />
          </p>
        );
      })}
    </>
  );
};

const FormattedText: React.FC<{ text: string }> = ({ text }) => {
  // Simple regex parser for **bold**, `code`, and [link](url)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    const codeMatch = remaining.match(/`([^`]+)`/);
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);

    const matches = [
      boldMatch ? { index: boldMatch.index!, length: boldMatch[0].length, type: 'bold', text: boldMatch[1], raw: boldMatch[0] } : null,
      codeMatch ? { index: codeMatch.index!, length: codeMatch[0].length, type: 'code', text: codeMatch[1], raw: codeMatch[0] } : null,
      linkMatch ? { index: linkMatch.index!, length: linkMatch[0].length, type: 'link', text: linkMatch[1], url: linkMatch[2], raw: linkMatch[0] } : null
    ].filter((m): m is Exclude<typeof m, null> => m !== null && m.index !== undefined);

    if (matches.length === 0) {
      parts.push(<span key={keyIdx++}>{remaining}</span>);
      break;
    }

    // Sort to find the first match
    matches.sort((a, b) => a.index - b.index);
    const first = matches[0];

    if (first.index > 0) {
      parts.push(<span key={keyIdx++}>{remaining.substring(0, first.index)}</span>);
    }

    if (first.type === 'bold') {
      parts.push(<strong key={keyIdx++} style={{ color: 'var(--text-heading)', fontWeight: 600 }}>{first.text}</strong>);
    } else if (first.type === 'code') {
      parts.push(<code key={keyIdx++} style={{ background: 'var(--sidebar-bg)', padding: '1px 4px', borderRadius: '4px', fontSize: '11px', fontFamily: 'var(--mono)', color: 'var(--text-heading)' }}>{first.text}</code>);
    } else if (first.type === 'link') {
      parts.push(<a key={keyIdx++} href={(first as any).url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }} className="clickable">{(first as any).text}</a>);
    }

    remaining = remaining.substring(first.index + first.length);
  }

  return <>{parts}</>;
};
