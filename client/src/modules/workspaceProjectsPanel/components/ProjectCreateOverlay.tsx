import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { FolderPlus } from 'lucide-react';
import { Button, TextInput, Textarea, Modal, Alert } from '@library';

import type { ProjectCreateOverlayProps } from '../types/WorkspaceProjectPanel';
import { createWorkspaceProjectPanelCreateProjectFormFactory } from '../utils/WorkspaceProjectPanel';

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
  const formFactory = useMemo(() => createWorkspaceProjectPanelCreateProjectFormFactory(), []);

  const resetForm = useCallback(() => {
    setProjectName('');
    setProjectKey('');
    setProjectDescription('');
    setFormError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (!loading) {
      resetForm();
      onClose();
    }
  }, [loading, onClose, resetForm]);

  const handleSubmit = useCallback(
    async (event?: FormEvent<HTMLFormElement>) => {
      event?.preventDefault();
      setFormError(null);

      const { value, error } = formFactory.buildValidatedPayload({
        name: projectName,
        description: projectDescription,
        key: projectKey,
      });

      if (error) {
        setFormError(error);
        return;
      }

      try {
        await onSubmitProject({
          name: value.name,
          description: value.description,
          key: value.key,
        });
        resetForm();
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Failed to create project.');
      }
    },
    [formFactory, onSubmitProject, projectDescription, projectKey, projectName, resetForm]
  );

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
        <Button type="submit" variant="primary" disabled={loading}>
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
        {feedbackMessage && <Alert type="error">{feedbackMessage}</Alert>}

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
            onChange={(event) => setProjectKey(formFactory.sanitizeProjectKey(event.target.value))}
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
