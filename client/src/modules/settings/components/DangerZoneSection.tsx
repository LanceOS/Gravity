import React, { useState } from 'react';
import { Card, Stack, TextInput, Alert, Button } from '@library';
import type { WorkspaceSummary } from '../../../hooks/useWorkspaceDirectory';

interface DangerZoneSectionProps {
  workspace: WorkspaceSummary;
  deleteLoading?: boolean;
  deleteError?: string | null;
  onDeleteWorkspace?: () => Promise<void>;
  onClearDeleteError?: () => void;
}

export function DangerZoneSection({
  workspace,
  deleteLoading,
  deleteError,
  onDeleteWorkspace,
  onClearDeleteError,
}: DangerZoneSectionProps) {
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  return (
    <Card style={{ padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
      <Stack gap="var(--space-5)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#FFF' }}>Danger Zone</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Deleting a workspace is permanent and cannot be undone. All projects, tickets, comments, and members within this workspace will be deleted.
          </p>
        </div>
        
        {deleteError && (
          <Alert type="error">
            {deleteError}
          </Alert>
        )}

        <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <TextInput
              label={`Type "${workspace.name}" to confirm`}
              value={deleteConfirmation}
              onChange={(e) => {
                setDeleteConfirmation(e.target.value);
                if (deleteError && onClearDeleteError) {
                  onClearDeleteError();
                }
              }}
            />
          </div>
          <Button
            variant="danger"
            disabled={!onDeleteWorkspace || deleteConfirmation !== workspace.name || deleteLoading}
            loading={deleteLoading}
            onClick={() => onDeleteWorkspace?.()}
          >
            Delete Workspace
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
