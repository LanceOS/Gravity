import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Ticket } from '../../../context/TicketContext';
import { Button, Select, Modal, Alert, Textarea, Popover } from '@library';
import { AlertCircle } from 'lucide-react';
import type { CreateTicketModalProps } from '../types/CreateTicketModal';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../utils/CreateTicketModal';
import { useTickets } from '../../../context/TicketContext';
import { LabelManagerPopoverContent } from './LabelManagerPopoverContent';
import './CreateTicketModal.css';

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
  const projectLabels = useMemo(
    () => labels.filter((label) => label.projectId === projectId),
    [labels, projectId],
  );

  const { createLabel } = useTickets();

  // `projectId` is initialized from props via useState above. The modal
  // component is mounted/unmounted when opened, so remounting will reset
  // the initial value. Removing the synchronous setState in an effect
  // avoids cascading renders.

  useEffect(() => {
    setLabelIds((currentLabelIds) => currentLabelIds.filter((labelId) => projectLabels.some((label) => label.id === labelId)));
  }, [projectLabels]);

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
      style={{ maxWidth: '980px', padding: 0 }}
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} className="create-ticket-modal">
        {formError && (
          <div className="create-ticket-modal__alert">
            <Alert type="error">
              {formError}
            </Alert>
          </div>
        )}
        <div className="create-ticket-modal__layout">
          <section className="create-ticket-modal__panel create-ticket-modal__panel--editor">
            <div className="create-ticket-modal__panel-heading">Details</div>

            <Textarea
              label="Issue Title"
              placeholder="Add a concise issue title"
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
              className="create-ticket-modal__title-input"
              inputStyle={{
                minHeight: '58px',
                fontSize: '18px',
                fontWeight: 600,
                lineHeight: 1.35,
              }}
            />

            <Textarea
              label="Description"
              placeholder="Add description... (markdown supported)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoGrow
              className="create-ticket-modal__description-input"
              inputStyle={{
                minHeight: '190px',
                lineHeight: 1.55,
              }}
            />
          </section>

          <aside className="create-ticket-modal__panel create-ticket-modal__panel--sidebar">
            <div className="create-ticket-modal__panel-heading">Properties</div>

            <Select
              label="Project"
              value={projectId}
              onValueChange={(nextProjectId: string) => setProjectId(nextProjectId)}
              options={projectOptions}
              aria-label="Select project"
              disabled={!!parentId} // Sub-tasks lock to parent project
            />

            <Select
              label="Status"
              value={status}
              onValueChange={(nextStatus: string) => setStatus(nextStatus as Ticket['status'])}
              options={STATUS_OPTIONS}
              aria-label="Select status"
            />

            <Select
              label="Priority"
              value={priority}
              onValueChange={(nextPriority: string) => setPriority(nextPriority as Ticket['priority'])}
              options={PRIORITY_OPTIONS}
              aria-label="Select priority"
            />

            <Select
              label="Assignee"
              value={assigneeId}
              onValueChange={(nextAssigneeId: string) => setAssigneeId(nextAssigneeId)}
              options={assigneeOptions}
              aria-label="Select assignee"
            />

            <div className="create-ticket-modal__field">
              <span className="label">Labels</span>
              <Popover
                align="right"
                style={{ display: 'block' }}
                contentClassName="create-ticket-modal__labels-popover"
                trigger={
                  <button
                    type="button"
                    className="clickable create-ticket-modal__labels-trigger"
                  >
                    <span className="create-ticket-modal__labels-trigger-value">
                      {labelIds.length > 0
                        ? `${labelIds.length} label${labelIds.length > 1 ? 's' : ''} selected`
                        : 'Select labels'}
                    </span>
                  </button>
                }
              >
                <LabelManagerPopoverContent
                  projectId={projectId}
                  assignedLabelIds={new Set(labelIds)}
                  allLabels={labels}
                  onAssign={(id) => { setLabelIds((prev) => [...prev, id]); }}
                  onUnassign={(id) => { setLabelIds((prev) => prev.filter(lId => lId !== id)); }}
                  onCreate={async (name, color) => {
                     const newLabel = await createLabel({
                       name,
                       color,
                       projectId: projectId,
                       description: '',
                     });
                     if (newLabel) {
                       setLabelIds((prev) => [...prev, newLabel.id]);
                     }
                  }}
                />
              </Popover>
            </div>

            <Select
              label="Cycle"
              value={cycleId}
              onValueChange={(nextCycleId: string) => setCycleId(nextCycleId)}
              options={cycleOptions}
              aria-label="Select cycle"
            />
          </aside>
        </div>
      </form>
    </Modal>
  );
};
