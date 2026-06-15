import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from '../../../layouts/PlaceholderLayout/PlaceholderLayout';

export default function TeamSpecificViewView() {
  const params = useParams();
  const { workspaceId, teamId, viewId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Teams' }, { label: teamId || 'Team' }, { label: 'Views' }, { label: viewId || 'View' }]}
      title={`Custom Team View: ${viewId}`}
      description={`Filtered workspace dashboard according to custom rules defined in view ${viewId}.`}
      params={params}
      degradation={{
        message: 'This workspace does not currently use teams. Custom views degrade to Workspace all tasks view.',
        targetPath: `/workspaces/${workspaceId}/all`,
        targetLabel: 'Workspace All Tasks',
      }}
    >
      <div className="placeholder-table-wrapper">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <h3 style={{ fontSize: '15px', color: '#fff' }}>Filter Rules</h3>
        </div>
        <div className="placeholder-table-row" style={{ gridTemplateColumns: '150px 1fr' }}>
          <div style={{ fontWeight: 600 }}>Filter Query:</div>
          <div><code>assignee:me status:active priority:high,urgent</code></div>
        </div>
        <div className="placeholder-table-row" style={{ gridTemplateColumns: '150px 1fr' }}>
          <div style={{ fontWeight: 600 }}>Sorting:</div>
          <div><code>Priority (Desc), Due Date (Asc)</code></div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
