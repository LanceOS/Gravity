import React, { useState, useEffect } from 'react';
import type { Ticket } from '../../../context/TicketContext';
import { Button, Select, Modal, Alert, TextInput, Textarea } from '@library';
import { AlertCircle } from 'lucide-react';
import type { CreateTicketModalProps } from '../types/CreateTicketModal';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../utils/CreateTicketModal';

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

  const modalTitle = parentTicket ? `Create Subtask for ${parentTicket.key}` : 'Create New Issue';

  const modalFooter = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: 'var(--color-text-disabled)' }}>
        <AlertCircle size={12} />
        <span>Press <kbd style={{ fontFamily: 'var(--mono)', border: '1px solid var(--color-border-default)', background: 'var(--color-base50)', padding: '1px 3px', borderRadius: '3px' }}>Ctrl+Enter</kbd> to submit</span>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => void handleSubmit()} variant="primary" style={{ padding: '6px 16px' }}>
          {parentTicket ? 'Create Subtask' : 'Create Issue'}
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={modalTitle}
      footer={modalFooter}
      style={{ maxWidth: '600px', padding: 0 }}
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        {formError && (
          <div style={{ padding: '20px 20px 0 20px' }}>
            <Alert type="error">
              {formError}
            </Alert>
          </div>
        )}
        
        {/* Main Title & Description Inputs */}
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Title */}
          <div>
            <TextInput 
              placeholder="Issue title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              required
            />
          </div>

          {/* Description */}
          <div>
            <Textarea 
              rows={5}
              aria-label="Description"
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
            background: 'var(--color-base50)',
            borderTop: '1px solid var(--color-border-default)',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '12px'
          }}
        >
          {/* Project */}
          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Project</span>
            <Select
              value={projectId}
              onValueChange={(nextProjectId: string) => setProjectId(nextProjectId)}
              options={projectOptions}
              aria-label="Select project"
              disabled={!!parentId} // Sub-tasks lock to parent project
            />
          </div>

          {/* Status */}
          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Status</span>
            <Select
              value={status}
              onValueChange={(nextStatus: string) => setStatus(nextStatus as Ticket['status'])}
              options={STATUS_OPTIONS}
              aria-label="Select status"
            />
          </div>

          {/* Priority */}
          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Priority</span>
            <Select
              value={priority}
              onValueChange={(nextPriority: string) => setPriority(nextPriority as Ticket['priority'])}
              options={PRIORITY_OPTIONS}
              aria-label="Select priority"
            />
          </div>

          {/* Assignee */}
          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Assignee</span>
            <Select
              value={assigneeId}
              onValueChange={(nextAssigneeId: string) => setAssigneeId(nextAssigneeId)}
              options={assigneeOptions}
              aria-label="Select assignee"
            />
          </div>

          {/* Domain */}
          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Domain</span>
            <Select
              value={domainId}
              onValueChange={(nextDomainId: string) => setDomainId(nextDomainId)}
              options={domainOptions}
              aria-label="Select domain"
            />
          </div>

          {/* Cycle */}
          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Cycle</span>
            <Select
              value={cycleId}
              onValueChange={(nextCycleId: string) => setCycleId(nextCycleId)}
              options={cycleOptions}
              aria-label="Select cycle"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
};

