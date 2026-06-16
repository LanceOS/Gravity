import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Ticket } from '../../../../context/TicketContext';
import { Button, Select, Textarea, Popover, RichTextEditor, createEmptyRichTextValue } from '@library';
import { AlertCircle } from 'lucide-react';
import { ModalDialog } from '../../../../components/ModalDialog';
import type { CreateTicketModalProps } from '../../types/CreateTicketModal';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../utils/CreateTicketModal';
import { useTickets } from '../../../../context/TicketContext';
import { SearchableOptionPickerPopoverContent } from '../SearchableOptionPickerPopoverContent';
import { LabelBadge } from '../LabelBadge';
import { Plus } from 'lucide-react';
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
  const [description, setDescription] = useState(createEmptyRichTextValue());
  const [projectId, setProjectId] = useState(parentTicket ? parentTicket.projectId : defaultProjectId);
  const [status, setStatus] = useState<Ticket['status']>(initialStatus || 'todo');
  const [priority, setPriority] = useState<Ticket['priority']>('no_priority');
  const [assigneeId, setAssigneeId] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [cycleId, setCycleId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const projectLabels = useMemo(
    () => labels.filter((label) => label.projectId === projectId || !label.projectId),
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

  const handleSubmit = useCallback(async (e?: React.SubmitEvent<HTMLFormElement>) => {
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
      description,
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
  const labelOptions = useMemo(() => projectLabels.map((label) => ({
    id: label.id,
    label: label.name,
    description: label.description || undefined,
    color: label.color,
    searchText: [label.name, label.description].filter(Boolean).join(' '),
  })), [projectLabels]);

  const modalTitle = parentTicket ? `Create Subtask for ${parentTicket.key}` : 'Create New Issue';

  return (
    <ModalDialog.Root
      isOpen={true}
      onClose={onClose}
      size="xl"
      style={{ maxWidth: '980px' }}
    >
      <ModalDialog.Header title={modalTitle} />

      <ModalDialog.Body>
        <form id="create-ticket-form" onSubmit={handleSubmit} className="create-ticket-modal" noValidate>
          {formError ? <ModalDialog.Feedback type="error">{formError}</ModalDialog.Feedback> : null}
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

              <RichTextEditor
                value={description}
                onChange={setDescription}
                placeholder="Add a description..."
                minHeight="190px"
                className="create-ticket-modal__description-editor"
                surface="bare"
                toolbarMode="bubble"
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
                <span className="label" style={{ marginBottom: '8px', display: 'block' }}>Labels</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                  {labelIds.length > 0 && (
                    labelIds.map((id) => {
                      const label = labels.find((l) => l.id === id);
                      if (!label) return null;
                      return (
                        <LabelBadge
                          key={label.id}
                          label={label}
                          size="sm"
                          onRemove={() => setLabelIds((prev) => prev.filter(lId => lId !== id))}
                        />
                      );
                    })
                  )}

                  <Popover
                    align="left"
                    style={{ display: 'block' }}
                    contentClassName="create-ticket-modal__labels-popover"
                    trigger={
                      <button
                        type="button"
                        className="clickable"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          background: 'var(--color-base100)',
                          border: '1px dashed var(--color-border-default)',
                          color: 'var(--color-text-secondary)',
                          fontSize: '11px',
                          fontWeight: 550,
                          cursor: 'pointer',
                          height: '20px',
                          transition: 'all 150ms ease',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--color-primary)';
                          e.currentTarget.style.color = 'var(--color-text-primary)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--color-border-default)';
                          e.currentTarget.style.color = 'var(--color-text-secondary)';
                        }}
                      >
                        <Plus size={10} />
                        <span>Add Label</span>
                      </button>
                    }
                  >
                    <SearchableOptionPickerPopoverContent
                      title="Search or Create Label"
                      searchPlaceholder="Type to search or create..."
                      options={labelOptions}
                      selectedIds={new Set(labelIds)}
                      onToggle={(id, isSelected) => {
                        setLabelIds((prev) => (
                          isSelected
                            ? prev.filter((labelId) => labelId !== id)
                            : prev.includes(id)
                              ? prev
                              : [...prev, id]
                        ));
                      }}
                      onCreate={async (name, color) => {
                        const newLabel = await createLabel({
                          name,
                          color,
                          projectId: projectId,
                          description: '',
                        });
                        if (newLabel) {
                          setLabelIds((prev) => (prev.includes(newLabel.id) ? prev : [...prev, newLabel.id]));
                        }
                      }}
                      createHeading="CREATE NEW LABEL:"
                      emptyStateLabel="No matching labels"
                    />
                  </Popover>
                </div>
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
      </ModalDialog.Body>

      <ModalDialog.Footer align="between">
        <span className="modal-dialog__hint create-ticket-modal__footer-hint">
          <AlertCircle size={12} />
          <span>Press <kbd>Ctrl+Enter</kbd> to submit</span>
        </span>

        <ModalDialog.Actions>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="create-ticket-form" variant="primary" style={{ padding: '6px 16px' }}>
            {parentTicket ? 'Create Subtask' : 'Create Issue'}
          </Button>
        </ModalDialog.Actions>
      </ModalDialog.Footer>
    </ModalDialog.Root>
  );
};
