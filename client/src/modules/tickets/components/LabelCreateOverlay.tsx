import React, { useEffect, useState } from 'react';
import { Tag } from 'lucide-react';
import { Button, CircularColorInput, TextInput, Textarea } from '@library';
import { FormSection } from '../../../components/FormSection';
import { ModalDialog } from '../../../components/ModalDialog';

const DEFAULT_LABEL_COLOR = '#3b82f6';

export interface LabelCreateOverlayProps {
  loading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmitLabel: (label: { name: string; color: string; description: string }) => Promise<void>;
}

export function LabelCreateOverlay({
  loading,
  errorMessage,
  onClose,
  onSubmitLabel,
}: LabelCreateOverlayProps) {
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(DEFAULT_LABEL_COLOR);
  const [labelDescription, setLabelDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  const handleSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setFormError(null);

    if (!labelName.trim()) {
      setFormError('Please enter a label name.');
      return;
    }

    try {
      await onSubmitLabel({
        name: labelName.trim(),
        color: labelColor,
        description: labelDescription.trim(),
      });
      handleClose();
    } catch {
      // Server-side submission errors are surfaced via the parent-provided
      // errorMessage prop. Keep formError reserved for client-side validation
      // so a generic fallback here does not mask a later, more specific error.
    }
  };

  useEffect(() => {
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
  }, [handleClose, handleSubmit]);

  const feedbackMessage = formError || errorMessage;

  return (
    <ModalDialog.Root
      isOpen={true}
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
