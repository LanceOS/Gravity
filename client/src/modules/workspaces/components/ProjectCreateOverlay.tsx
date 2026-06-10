import { useEffect, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { Button, TextInput, Textarea, Modal, Alert } from '@library';
import type { ProjectCreateOverlayProps } from '../types/WorkspaceProjectPanel';
import { sanitizeProjectKey } from '../utils/WorkspaceProjectPanel';

export function ProjectCreateOverlay({
  loading,
  errorMessage,
  onClose,
  onSubmitProject,
}: ProjectCreateOverlayProps) {
  const [projectName, setProjectName] = useState('');
  const [projectKey, setProjectKey] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleClose = () => {
    if (!loading) {
      onClose();
    }
  };

  const handleSubmit = async (event?: React.SubmitEvent<HTMLFormElement>) => {
    event?.preventDefault();
    setFormError(null);

    if (!projectName.trim()) {
      setFormError('Please enter a project name.');
      return;
    }

    if (!projectKey.trim()) {
      setFormError('Please enter a project key.');
      return;
    }

    try {
      await onSubmitProject({
        name: projectName.trim(),
        key: projectKey.trim(),
        description: projectDescription.trim(),
      });
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
      <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)' }}>Ctrl/Cmd + Enter creates the project.</span>

      <div style={{ display: 'flex', gap: '8px' }}>
        <Button type="button" onClick={handleClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={loading} onClick={() => void handleSubmit()}>
          <FolderPlus size={14} style={{ marginRight: '6px' }} />
          <span>{loading ? 'Creating Project...' : 'Create Project'}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <Modal
      isOpen={true}
      onClose={handleClose}
      title="New Project"
      footer={modalFooter}
      style={{ maxWidth: '500px' }}
    >
      <form onSubmit={(e) => { e.preventDefault(); void handleSubmit(); }} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        {feedbackMessage && (
          <Alert type="error">
            {feedbackMessage}
          </Alert>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-md)' }}>
          <TextInput
            label="Project Name"
            placeholder="Core Platform"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            autoFocus
            required
            disabled={loading}
          />

          <TextInput
            label="Project Key"
            value={projectKey}
            onChange={(event) => setProjectKey(sanitizeProjectKey(event.target.value))}
            placeholder="CORE"
            maxLength={8}
            required
            disabled={loading}
          />
        </div>

        <Textarea
          label="Description"
          placeholder="Describe the focus of this project within the workspace."
          value={projectDescription}
          onChange={(event) => setProjectDescription(event.target.value)}
          rows={4}
          disabled={loading}
        />
      </form>
    </Modal>
  );
}
