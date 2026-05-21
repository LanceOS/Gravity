import React, { useState, useEffect } from 'react';
import type { Cycle, Domain, Project, Ticket, User } from '../context/TicketContext';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { X, Sparkles, AlertCircle } from 'lucide-react';

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

interface CreateTicketModalProps {
  onClose: () => void;
  projects: Project[];
  domains: Domain[];
  cycles: Cycle[];
  users: User[];
  parentTicket: Ticket | null;
  defaultProjectId: string;
  onSubmitTicket: (ticket: {
    title: string;
    description: string;
    status: Ticket['status'];
    priority: Ticket['priority'];
    projectId: string;
    domainId: string | null;
    cycleId: string | null;
    assigneeId: string | null;
    parentId: string | null;
  }) => Promise<boolean>;
  initialStatus?: Ticket['status'];
  parentId?: string;
}

export const CreateTicketModal: React.FC<CreateTicketModalProps> = ({
  onClose,
  projects,
  domains,
  cycles,
  users,
  parentTicket,
  defaultProjectId,
  onSubmitTicket,
  initialStatus,
  parentId,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [projectId, setProjectId] = useState(parentTicket ? parentTicket.projectId : defaultProjectId);
  const [status, setStatus] = useState<Ticket['status']>(initialStatus || 'todo');
  const [priority, setPriority] = useState<Ticket['priority']>('no_priority');
  const [assigneeId, setAssigneeId] = useState('');
  const [domainId, setDomainId] = useState('');
  const [cycleId, setCycleId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setProjectId(parentTicket ? parentTicket.projectId : defaultProjectId);
  }, [parentTicket, defaultProjectId]);

  // Handle keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, description, projectId, status, priority, assigneeId, domainId, cycleId]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError('Please enter a ticket title.');
      return;
    }

    if (!projectId) {
      setFormError('Please select a project.');
      return;
    }

    const created = await onSubmitTicket({
      title: title.trim(),
      description: description.trim(),
      status,
      priority,
      projectId,
      domainId: domainId || null,
      cycleId: cycleId || null,
      assigneeId: assigneeId || null,
      parentId: parentId || null
    });

    if (created) {
      onClose();
    } else {
      setFormError('Failed to create the ticket.');
    }
  };

  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  const assigneeOptions = [{ value: '', label: 'Unassigned' }, ...users.map((user) => ({ value: user.id, label: user.name }))];
  const domainOptions = [{ value: '', label: 'No Domain' }, ...domains.map((domain) => ({ value: domain.id, label: domain.name }))];
  const cycleOptions = [{ value: '', label: 'No Cycle' }, ...cycles.map((cycle) => ({ value: cycle.id, label: cycle.name }))];

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px'
      }}
      onClick={onClose}
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '600px',
          maxWidth: '100%',
          background: 'var(--card-bg)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.2)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div 
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          <Sparkles size={16} color="var(--accent)" />
          <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-heading)' }}>
            {parentTicket ? `Create Subtask for ${parentTicket.key}` : 'Create New Issue'}
          </span>

          <Button
            onClick={onClose}
            variant="ghost"
            size="sm"
            aria-label="Close create ticket modal"
            style={{
              marginLeft: 'auto',
              color: 'var(--text-muted)',
              minHeight: '28px',
              width: '28px',
              padding: 0,
              border: 'none'
            }}
          >
            <X size={16} />
          </Button>
        </div>

        {/* Modal Body Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {formError && (
            <div
              style={{
                margin: '16px 20px 0 20px',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                fontSize: '12px'
              }}
            >
              {formError}
            </div>
          )}
          
          {/* Main Title & Description Inputs */}
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            
            {/* Title */}
            <div>
              <input 
                type="text"
                className="input"
                style={{ 
                  fontSize: '18px', 
                  fontWeight: 500, 
                  border: 'none', 
                  borderBottom: '1px solid var(--border)', 
                  borderRadius: 0, 
                  padding: '8px 0',
                  background: 'transparent'
                }}
                placeholder="Issue title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                required
              />
            </div>

            {/* Description */}
            <div>
              <textarea 
                className="input"
                rows={5}
                style={{ 
                  border: 'none', 
                  borderRadius: 0, 
                  padding: '8px 0', 
                  fontSize: '13px', 
                  lineHeight: '1.5',
                  resize: 'none',
                  background: 'transparent'
                }}
                placeholder="Add description... (markdown supported)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

          </div>

          {/* Bottom Grid Selectors */}
          <div 
            style={{
              padding: '16px 20px',
              background: 'var(--sidebar-bg)',
              borderTop: '1px solid var(--border)',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px'
            }}
          >
            {/* Project */}
            <div>
              <span className="label">Project</span>
              <Select
                value={projectId}
                onValueChange={setProjectId}
                options={projectOptions}
                ariaLabel="Select project"
                disabled={!!parentId} // Sub-tasks lock to parent project
              />
            </div>

            {/* Status */}
            <div>
              <span className="label">Status</span>
              <Select
                value={status}
                onValueChange={(nextStatus) => setStatus(nextStatus as Ticket['status'])}
                options={STATUS_OPTIONS}
                ariaLabel="Select status"
              />
            </div>

            {/* Priority */}
            <div>
              <span className="label">Priority</span>
              <Select
                value={priority}
                onValueChange={(nextPriority) => setPriority(nextPriority as Ticket['priority'])}
                options={PRIORITY_OPTIONS}
                ariaLabel="Select priority"
              />
            </div>

            {/* Assignee */}
            <div>
              <span className="label">Assignee</span>
              <Select
                value={assigneeId}
                onValueChange={setAssigneeId}
                options={assigneeOptions}
                ariaLabel="Select assignee"
              />
            </div>

            {/* Domain */}
            <div>
              <span className="label">Domain</span>
              <Select
                value={domainId}
                onValueChange={setDomainId}
                options={domainOptions}
                ariaLabel="Select domain"
              />
            </div>

            {/* Cycle */}
            <div>
              <span className="label">Cycle</span>
              <Select
                value={cycleId}
                onValueChange={setCycleId}
                options={cycleOptions}
                ariaLabel="Select cycle"
              />
            </div>

          </div>

          {/* Footer Submit Button Panel */}
          <div 
            style={{
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'var(--card-bg)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
              <AlertCircle size={12} />
              <span>Press <kbd style={{ fontFamily: 'var(--mono)', border: '1px solid var(--border)', background: 'var(--sidebar-bg)', padding: '1px 3px', borderRadius: '3px' }}>Ctrl+Enter</kbd> to submit</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <Button
                type="button" 
                onClick={onClose} 
              >
                Cancel
              </Button>
              
              <Button
                type="submit" 
                variant="primary"
                style={{ padding: '6px 16px' }}
              >
                {parentTicket ? 'Create Subtask' : 'Create Issue'}
              </Button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
};
