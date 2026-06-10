import React, { useState, useEffect, useCallback } from 'react';
import type { Ticket } from '../../../context/TicketContext';
import { Button, Select, Modal, Alert, Textarea, Popover } from '@library';
import { AlertCircle } from 'lucide-react';
import type { CreateTicketModalProps } from '../types/CreateTicketModal';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../utils/CreateTicketModal';

export const CreateTicketModal: React.FC<CreateTicketModalProps> = ({
  onClose,
  projects,
  labels,
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
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // `projectId` is initialized from props via useState above. The modal
  // component is mounted/unmounted when opened, so remounting will reset
  // the initial value. Removing the synchronous setState in an effect
  // avoids cascading renders.

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
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
      labelIds,
      cycleId: cycleId || null,
      assigneeId: assigneeId || null,
      parentId: parentId || null
    });

    if (created) {
      onClose();
    } else {
      setFormError('Failed to create the ticket.');
    }
  }, [title, description, status, priority, projectId, labelIds, cycleId, assigneeId, parentId, onSubmitTicket, onClose]);

  // Handle keyboard shortcut Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Ctrl/Cmd + Enter to submit
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSubmit, onClose]);

  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  const assigneeOptions = [{ value: '', label: 'Unassigned' }, ...users.map((user) => ({ value: user.id, label: user.name }))];
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
        
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <Textarea 
              placeholder="Issue title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                }
              }}
              autoGrow
              autoFocus
              required
            />
          </div>

          <div>
            <Textarea 
              aria-label="Description"
              placeholder="Add description... (markdown supported)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoGrow
            />
          </div>
        </div>


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

          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Status</span>
            <Select
              value={status}
              onValueChange={(nextStatus: string) => setStatus(nextStatus as Ticket['status'])}
              options={STATUS_OPTIONS}
              aria-label="Select status"
            />
          </div>

          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Priority</span>
            <Select
              value={priority}
              onValueChange={(nextPriority: string) => setPriority(nextPriority as Ticket['priority'])}
              options={PRIORITY_OPTIONS}
              aria-label="Select priority"
            />
          </div>

          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Assignee</span>
            <Select
              value={assigneeId}
              onValueChange={(nextAssigneeId: string) => setAssigneeId(nextAssigneeId)}
              options={assigneeOptions}
              aria-label="Select assignee"
            />
          </div>

          <div>
            <span className="label" style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-disabled)', marginBottom: '4px' }}>Labels</span>
            <Popover
              align="left"
              trigger={
                <button
                  type="button"
                  className="clickable"
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    fontSize: '13px',
                    background: 'var(--color-surface-card)',
                    border: '1px solid var(--color-border-default)',
                    borderRadius: '6px',
                    color: labelIds.length > 0 ? 'var(--color-text-primary)' : 'var(--color-text-disabled)',
                    textAlign: 'left',
                    cursor: 'pointer',
                    minHeight: '34px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>
                    {labelIds.length > 0
                      ? `${labelIds.length} label${labelIds.length > 1 ? 's' : ''} selected`
                      : 'Select labels'}
                  </span>
                </button>
              }
            >
              <div style={{ width: '200px', padding: '10px', background: 'var(--color-surface-overlay)', borderRadius: '6px', border: '1px solid var(--color-border-default)', boxShadow: 'var(--shadow-md)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', marginBottom: '4px' }}>
                  Select Labels
                </div>
                <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {labels.filter(l => l.projectId === projectId).length > 0 ? (
                    labels.filter(l => l.projectId === projectId).map((l) => {
                      const isChecked = labelIds.includes(l.id);
                      return (
                        <label
                          key={l.id}
                          className="clickable"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            fontSize: '12px',
                            color: 'var(--color-text-primary)',
                            cursor: 'pointer',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            background: isChecked ? 'rgba(255,255,255,0.03)' : 'transparent',
                            userSelect: 'none',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (isChecked) {
                                setLabelIds(labelIds.filter((id) => id !== l.id));
                              } else {
                                setLabelIds([...labelIds, l.id]);
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: l.color, flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {l.name}
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', textAlign: 'center', padding: '8px 0' }}>
                      No labels in this project
                    </div>
                  )}
                </div>
              </div>
            </Popover>
          </div>

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

