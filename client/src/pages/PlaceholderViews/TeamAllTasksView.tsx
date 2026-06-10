import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from './PlaceholderLayout';

export default function TeamAllTasksView() {
  const params = useParams();
  const { workspaceId, teamId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Teams' }, { label: teamId || 'Team' }, { label: 'Tasks' }]}
      title="Team Backlog"
      description={`Aggregated list of all tasks assigned to Team ${teamId}.`}
      params={params}
      degradation={{
        message: 'This workspace does not currently use teams. We have provided workspace backlog as a fallback.',
        targetPath: `/workspaces/${workspaceId}/all`,
        targetLabel: 'Workspace All Tasks',
      }}
    >
      <div className="placeholder-table-wrapper">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <h3 style={{ fontSize: '15px', color: '#fff' }}>Team Task Backlog</h3>
        </div>
        <div className="placeholder-table-header">
          <div>Key</div>
          <div>Title</div>
          <div>Assignee</div>
          <div>Status</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-81</code></div>
          <div>Optimise client state updates</div>
          <div>Lance OS</div>
          <div style={{ color: '#f59e0b' }}>In Progress</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-82</code></div>
          <div>Write documentation for route structures</div>
          <div>Jane Dev</div>
          <div style={{ color: '#ef4444' }}>Todo</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-83</code></div>
          <div>Integrate TipTap editor alternative</div>
          <div>Jane Dev</div>
          <div style={{ color: '#10b981' }}>Done</div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
