import React, { useEffect, useState } from 'react';
import { Tag } from 'lucide-react';
import { Button, TextInput, Textarea, Modal, Alert } from '@library';

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

  const modalFooter = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
      <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)' }}>Ctrl/Cmd + Enter creates the label.</span>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Button type="button" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={loading}>
          <Tag size={14} style={{ marginRight: '6px' }} />
          <span>{loading ? 'Creating Label...' : 'Create Label'}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      title="New Label"
      footer={modalFooter}
      style={{ maxWidth: '400px' }}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {feedbackMessage && (
          <Alert type="error">
            {feedbackMessage}
          </Alert>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--color-text-primary)' }}>Color</span>
          <input
            type="color"
            value={labelColor}
            onChange={(event) => setLabelColor(event.target.value)}
            disabled={loading}
            style={{ height: '36px', padding: '2px', cursor: 'pointer', width: '100%', borderRadius: '4px', border: '1px solid var(--color-border-default)' }}
          />
        </div>

        <Textarea
          label="Description"
          placeholder="Explain when this label should be used."
          value={labelDescription}
          onChange={(event) => setLabelDescription(event.target.value)}
          rows={3}
          disabled={loading}
        />
      </form>
    </Modal>
  );
}
