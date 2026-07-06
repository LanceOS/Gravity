import React from 'react';
import { Download } from 'lucide-react';
import { Alert, Button, Card, Stack } from '@library';
import { useSettingsScreenContext } from '../../../context/settings/useSettingsScreenContext';

export function ExportTasksSection(): React.ReactNode {
  const { workspace, exportLoading, exportError, onExportTasks } = useSettingsScreenContext();
  const isOwner = workspace.memberRole === 'owner';

  if (!isOwner) {
    return null;
  }

  return (
    <Card style={{ padding: 'var(--space-lg)', borderRadius: 'var(--radius-lg)' }}>
      <Stack gap="var(--space-lg)">
        <div>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>Export Tasks</h2>
          <p style={{ margin: '4px 0 0', color: 'var(--color-text-disabled)', fontSize: '12.5px', lineHeight: 1.5 }}>
            Download a JSON audit file containing every task in this workspace, including status, priority, assignee, timestamps, labels, and comments.
          </p>
        </div>

        {exportError && (
          <Alert type="error">
            {exportError}
          </Alert>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            variant="accent"
            leftIcon={<Download size={14} />}
            loading={exportLoading}
            disabled={!onExportTasks || exportLoading}
            onClick={() => onExportTasks?.()}
          >
            Export Tasks
          </Button>
        </div>
      </Stack>
    </Card>
  );
}
