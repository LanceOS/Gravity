import { useEffect, useState } from 'react';
import { FolderPlus, Sparkles, X } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { ProjectCreateOverlayProps } from '../types';
import { sanitizeProjectKey } from '../utils';

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
      onClose();
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
        void handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [errorMessage, loading, projectDescription, projectKey, projectName]);

  const feedbackMessage = formError || errorMessage;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={handleClose}
    >
      <div
        style={{
          width: '640px',
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          background: 'var(--card-bg)',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.3), 0 10px 10px -5px rgba(0,0,0,0.2)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '14px 20px',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <Sparkles size={16} color="var(--accent)" />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)' }}>Create New Project</span>
          <Button
            type="button"
            onClick={handleClose}
            variant="ghost"
            size="sm"
            aria-label="Close create project overlay"
            disabled={loading}
            style={{
              marginLeft: 'auto',
              width: '28px',
              minHeight: '28px',
              padding: 0,
              border: 'none',
              color: 'var(--text-muted)',
            }}
          >
            <X size={16} />
          </Button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column' }}>
          {feedbackMessage ? (
            <div
              style={{
                margin: '16px 20px 0',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(239, 68, 68, 0.2)',
                background: 'rgba(239, 68, 68, 0.08)',
                color: '#ef4444',
                fontSize: '12px',
              }}
            >
              {feedbackMessage}
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '20px' }}>
            <input
              type="text"
              className="input"
              style={{
                fontSize: '18px',
                fontWeight: 500,
                border: 'none',
                borderBottom: '1px solid var(--border)',
                borderRadius: 0,
                padding: '8px 0',
                background: 'transparent',
              }}
              placeholder="Project name"
              value={projectName}
              onChange={(event) => setProjectName(event.target.value)}
              autoFocus
              required
            />

            <textarea
              className="input"
              rows={5}
              style={{
                border: 'none',
                borderRadius: 0,
                padding: '8px 0',
                fontSize: '13px',
                lineHeight: 1.5,
                resize: 'none',
                background: 'transparent',
              }}
              placeholder="Describe the focus of this project within the workspace."
              value={projectDescription}
              onChange={(event) => setProjectDescription(event.target.value)}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(140px, 180px)',
              gap: '12px',
              padding: '16px 20px',
              borderTop: '1px solid var(--border)',
              background: 'var(--sidebar-bg)',
            }}
          >
            <div>
              <span className="label">Project Key</span>
              <input
                className="input"
                value={projectKey}
                onChange={(event) => setProjectKey(sanitizeProjectKey(event.target.value))}
                placeholder="CORE"
                maxLength={8}
                required
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 20px',
              borderTop: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Press Ctrl/Cmd + Enter to create the project.</span>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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