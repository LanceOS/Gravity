import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Tag } from 'lucide-react';
import { Button, CircularColorInput, Select, TextInput, Textarea } from '@library';
import { FormSection } from '../../../components/FormSection';
import { ModalDialog } from '../../../components/ModalDialog';

const DEFAULT_LABEL_COLOR = '#3b82f6';

export interface LabelCreateScope {
  kind: 'team' | 'project';
  options: { value: string; label: string }[];
  defaultId: string;
}

export interface LabelCreateOverlayProps {
  scope?: LabelCreateScope;
  isOpen?: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmitLabel: (label: { name: string; color: string; description: string; teamId?: string; projectId?: string }) => Promise<void>;
}

export function LabelCreateOverlay({
  isOpen,
  scope,
  loading,
  errorMessage,
  onClose,
  onSubmitLabel,
}: LabelCreateOverlayProps) {
  const [scopeId, setScopeId] = useState('');
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(DEFAULT_LABEL_COLOR);
  const [labelDescription, setLabelDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (!loading) {
      onClose();
    }
  }, [loading, onClose]);

  const submissionPending = useRef(false);
  const handleSubmit = useCallback(async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!isOpen || submissionPending.current || loading) return;
    setFormError(null);

    if (!labelName.trim()) {
      setFormError('Please enter a label name.');
      return;
    }

    if (scope && !scope.options.some((option) => option.value === scopeId)) {
      setFormError(`Please select a ${scope.kind}.`);
      return;
    }

    submissionPending.current = true;
    try {
      await onSubmitLabel({
        ...(scope ? { [scope.kind === 'team' ? 'teamId' : 'projectId']: scopeId } : {}),
        name: labelName.trim(),
        color: labelColor,
        description: labelDescription.trim(),
      });
      handleClose();
    } catch {
      // Server-side submission errors are surfaced via the parent-provided
      // errorMessage prop. Keep formError reserved for client-side validation
      // so a generic fallback here does not mask a later, more specific error.
    } finally {
      submissionPending.current = false;
    }
  }, [isOpen, loading, labelName, scope, scopeId, onSubmitLabel, labelColor, labelDescription, handleClose]);

  const wasOpen = useRef(false);
  const previousScopeKind = useRef(scope?.kind);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setScopeId(scope?.defaultId ?? '');
      setLabelName('');
      setLabelColor(DEFAULT_LABEL_COLOR);
      setLabelDescription('');
      setFormError(null);
    } else if (isOpen && (!scopeId || previousScopeKind.current !== scope?.kind)) {
      // Scope metadata may arrive after the dialog opens. Preserve entered text.
      setScopeId(scope?.defaultId ?? '');
    }
    previousScopeKind.current = scope?.kind;
    wasOpen.current = !!isOpen;
  }, [isOpen, scope?.defaultId, scope?.kind, scopeId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        void handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose, handleSubmit]);

  const feedbackMessage = formError || errorMessage;

  return (
    <ModalDialog.Root
      isOpen={!!isOpen}
      onClose={handleClose}
      size="sm"
      style={{ maxWidth: '400px' }}
    >
      <ModalDialog.Header
        title="New Label"
        description="Create a label for organizing tickets."
      />

      <ModalDialog.Body>
        <FormSection.Root id="label-create-form" noValidate onSubmit={handleSubmit}>
          {feedbackMessage ? <ModalDialog.Feedback type="error">{feedbackMessage}</ModalDialog.Feedback> : null}

          {scope && (
            <Select
              label={scope.kind === 'team' ? 'Team' : 'Project'}
              placeholder={`Select a ${scope.kind}`}
              options={scope.options}
              value={scopeId}
              onValueChange={setScopeId}
              disabled={loading}
            />
          )}

          <TextInput
            label="Label Name"
            placeholder="Frontend Platform"
            value={labelName}
            onChange={(event) => setLabelName(event.target.value)}
            autoFocus
            required
            disabled={loading}
          />

          <CircularColorInput
            label="Color"
            value={labelColor}
            onChange={(event) => setLabelColor(event.target.value)}
            disabled={loading}
          />

          <Textarea
            label="Description"
            placeholder="Explain when this label should be used."
            value={labelDescription}
            onChange={(event) => setLabelDescription(event.target.value)}
            rows={3}
            disabled={loading}
          />
        </FormSection.Root>
      </ModalDialog.Body>

      <ModalDialog.Footer align="between">
        <span className="modal-dialog__hint">Ctrl/Cmd + Enter creates the label.</span>
        <ModalDialog.Actions>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" form="label-create-form" variant="primary" loading={loading} disabled={loading}>
            <Tag size={14} />
            <span>{loading ? 'Creating Label...' : 'Create Label'}</span>
          </Button>
        </ModalDialog.Actions>
      </ModalDialog.Footer>
    </ModalDialog.Root>
  );
}
