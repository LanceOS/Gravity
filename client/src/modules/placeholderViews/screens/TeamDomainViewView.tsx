import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from '../../../layouts/PlaceholderLayout/PlaceholderLayout';

export default function TeamDomainViewView() {
  const params = useParams();
  const { workspaceId, teamId, domainId: labelId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Teams' }, { label: teamId || 'Team' }, { label: 'Labels' }, { label: labelId || 'Label' }]}
      title={`Label Filtered: ${labelId}`}
      description={`Task tickets within label ${labelId} assigned to team ${teamId}.`}
      params={params}
      degradation={{
        message: 'This workspace does not currently use team labels. Falling back to workspace all tasks.',
        targetPath: `/workspaces/${workspaceId}/all`,
        targetLabel: 'Workspace All Tasks',
      }}
    >
      <div className="placeholder-table-wrapper">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <h3 style={{ fontSize: '15px', color: '#fff' }}>Label Tickets</h3>
        </div>
        <div className="placeholder-table-header">
          <div>Key</div>
          <div>Title</div>
          <div>Label</div>
          <div>Status</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-90</code></div>
          <div>Refactor CSS imports with cascades</div>
          <div>{labelId}</div>
          <div style={{ color: '#ef4444' }}>Todo</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-91</code></div>
          <div>Add label validation layers in auth</div>
          <div>{labelId}</div>
          <div style={{ color: '#10b981' }}>Done</div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
