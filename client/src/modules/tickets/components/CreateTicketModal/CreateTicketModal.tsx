import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { Ticket } from '../../../../context/TicketContextContext';
import { Button, Select, Textarea, Popover, RichTextEditor, createEmptyRichTextValue } from '@library';
import { Plus, X } from 'lucide-react';
import { ModalDialog } from '../../../../components/ModalDialog';
import type { CreateTicketModalProps } from '../../types/CreateTicketModal';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../utils/CreateTicketModal';
import { useLabels } from '../../../../context/label/LabelContext';
import { SearchableOptionPickerPopoverContent } from '../SearchableOptionPickerPopoverContent';
import { LabelBadge } from '../LabelBadge';
import './CreateTicketModal.css';

export const CreateTicketModal: React.FC<CreateTicketModalProps> = ({
  isOpen = true,
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
  const projectLabelIds = useMemo(
    () => new Set(projectLabels.map((label) => label.id)),
    [projectLabels],
  );
  const labelById = useMemo(
    () => new Map(labels.map((label) => [label.id, label] as const)),
    [labels],
  );

  const { createLabel } = useLabels();

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription(createEmptyRichTextValue());
      setProjectId(parentTicket ? parentTicket.projectId : defaultProjectId);
      setStatus(initialStatus || 'todo');
      setPriority('no_priority');
      setAssigneeId('');
      setLabelIds([]);
      setCycleId('');
      setFormError(null);
    }
  }, [isOpen, parentTicket, defaultProjectId, initialStatus]);

  // `projectId` is initialized from props via useState above. The modal
  // component is mounted/unmounted when opened, so remounting will reset
  // the initial value. Removing the synchronous setState in an effect
  // avoids cascading renders.

  useEffect(() => {
    setLabelIds((currentLabelIds) => currentLabelIds.filter((labelId) => projectLabelIds.has(labelId)));
  }, [projectLabelIds]);

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
      ariaLabel={modalTitle}
      className="create-ticket-modal__overlay"
      isOpen={isOpen}
      onClose={onClose}
      panelClassName="create-ticket-modal__dialog"
      size="xl"
      style={{ maxWidth: '920px' }}
    >
      <ModalDialog.Body className="create-ticket-modal__body">
        <form id="create-ticket-form" onSubmit={handleSubmit} className="create-ticket-modal" noValidate>
          <h2 className="sr-only">{modalTitle}</h2>
          {formError ? <ModalDialog.Feedback type="error">{formError}</ModalDialog.Feedback> : null}
          <div className="create-ticket-modal__main">
            <div className="create-ticket-modal__title-row">
              <Textarea
                aria-label="Issue Title"
                placeholder="Issue title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
                    e.preventDefault();
                    void handleSubmit();
                  }
                }}
                autoGrow
                autoFocus
                required
                className="create-ticket-modal__title-input"
                inputStyle={{
                  minHeight: '52px',
                  fontSize: '22px',
                  fontWeight: 650,
                  lineHeight: 1.25,
                }}
              />

              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label="Close dialog"
                className="create-ticket-modal__close-button"
                onClick={onClose}
              >
                <X size={16} />
              </Button>
            </div>

            <RichTextEditor
              value={description}
              onChange={setDescription}
              placeholder="Add a description..."
              minHeight="230px"
              className="create-ticket-modal__description-editor"
              surface="bare"
              toolbarMode="bubble"
            />

            <section className="create-ticket-modal__properties" aria-label="Ticket properties">
              {parentTicket ? (
                <div className="create-ticket-modal__field create-ticket-modal__field--parent">
                  <span className="label">Parent ticket</span>
                  <div className="create-ticket-modal__parent-value">
                    <span className="create-ticket-modal__parent-key">{parentTicket.key}</span>
                    <span className="create-ticket-modal__parent-title">{parentTicket.title}</span>
                  </div>
                </div>
              ) : null}

              <Select
                label="Project"
                value={projectId}
                onValueChange={(nextProjectId: string) => setProjectId(nextProjectId)}
                options={projectOptions}
                aria-label="Select project"
                disabled={!!parentId}
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

              <div className="create-ticket-modal__field create-ticket-modal__field--labels">
                <span className="label">Labels</span>
                <div className="create-ticket-modal__labels-value">
                  {labelIds.length > 0
                    ? labelIds.map((id) => {
                        const label = labelById.get(id);
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
                    : (
                        <span className="create-ticket-modal__labels-empty-text">No labels</span>
                      )}

                  <Popover
                    align="left"
                    style={{ display: 'block' }}
                    contentClassName="create-ticket-modal__labels-popover"
                    trigger={
                      <button
                        type="button"
                        className="create-ticket-modal__label-add-button clickable"
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
                label="Cycle / Sprint"
                value={cycleId}
                onValueChange={(nextCycleId: string) => setCycleId(nextCycleId)}
                options={cycleOptions}
                aria-label="Select cycle"
              />
            </section>
          </div>
        </form>
      </ModalDialog.Body>

      <ModalDialog.Footer align="end" className="create-ticket-modal__footer">
        <ModalDialog.Actions className="create-ticket-modal__actions">
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
