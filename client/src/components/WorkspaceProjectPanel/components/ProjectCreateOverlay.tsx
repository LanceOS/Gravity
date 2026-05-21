import { useEffect, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { ProjectCreateOverlayProps } from '../types';
import { sanitizeProjectKey } from '../utils';
import './ProjectCreateOverlay.css';

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

  const handleSubmit = async (event?: React.FormEvent<HTMLFormElement>) => {
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
      if (!errorMessage) {
        setFormError('Failed to create the project.');
      }
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
    <div
      className="project-create-overlay"
      onClick={handleClose}
    >
      <div
        className="project-create-overlay__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="project-create-overlay-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="project-create-overlay__header">
          <div>
            <div className="project-create-overlay__eyebrow">Workspace Projects</div>
            <h3 id="project-create-overlay-title" className="project-create-overlay__title">New Project</h3>
          </div>

          <button
            type="button"
            className="project-create-overlay__close"
            onClick={handleClose}
            aria-label="Close create project overlay"
            disabled={loading}
          >
            <X size={16} />
          </button>
        </div>

        <form className="project-create-overlay__form" onSubmit={handleSubmit}>
          {feedbackMessage ? (
            <div className="project-create-overlay__feedback">
              {feedbackMessage}
            </div>
          ) : null}

          <div className="project-create-overlay__grid">
            <label className="project-create-overlay__field">
              <span className="workspace-page__project-label">Project Name</span>
              <input
                type="text"
                className="workspace-page__project-input project-create-overlay__name-input"
                placeholder="Core Platform"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                autoFocus
                required
              />
            </label>

            <label className="project-create-overlay__field">
              <span className="workspace-page__project-label">Project Key</span>
              <input
                className="workspace-page__project-input workspace-page__project-input--key"
                value={projectKey}
                onChange={(event) => setProjectKey(sanitizeProjectKey(event.target.value))}
                placeholder="CORE"
                maxLength={8}
                required
              />
            </label>

            <label className="project-create-overlay__field project-create-overlay__field--description">
              <span className="workspace-page__project-label">Description</span>
              <textarea
                className="workspace-page__project-input workspace-page__project-input--textarea project-create-overlay__description-input"
                rows={4}
                placeholder="Describe the focus of this project within the workspace."
                value={projectDescription}
                onChange={(event) => setProjectDescription(event.target.value)}
              />
            </label>
          </div>

          <div className="project-create-overlay__actions">
            <span className="project-create-overlay__hint">Ctrl/Cmd + Enter creates the project.</span>

            <div className="project-create-overlay__buttons">
              <Button type="button" variant="ghost" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={loading}>
                <FolderPlus size={14} />
                <span>{loading ? 'Creating Project...' : 'Create Project'}</span>
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}