import React, { useState } from 'react';
import { Card, Stack, TextInput, Alert, Button } from '@library';
import { useSettingsScreenContext } from '../../../context/settings/useSettingsScreenContext';

export function DangerZoneSection(): React.ReactNode {
  const { isMobile, workspace, deleteLoading, deleteError, onDeleteWorkspace, onClearDeleteError } = useSettingsScreenContext();

  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#ef4444' }}>Danger Zone</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Deleting a workspace is permanent and cannot be undone. All projects, tickets, comments, and members within this workspace will be deleted.
          </p>
        </div>
        
        {deleteError && (
          <Alert type="error">
            {deleteError}
          </Alert>
        )}

        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: 'var(--space-md)', alignItems: isMobile ? 'stretch' : 'flex-end' }}>
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
