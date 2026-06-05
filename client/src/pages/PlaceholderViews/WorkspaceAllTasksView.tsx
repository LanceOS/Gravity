import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from './PlaceholderLayout';

export default function WorkspaceAllTasksView() {
  const params = useParams();

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Workspace' }, { label: 'All Tasks' }]}
      title="All Tasks"
      description="Consolidated task backlog across all projects in this workspace."
      params={params}
    >
      <div className="placeholder-table-wrapper">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <h3 style={{ fontSize: '15px', color: '#fff' }}>Global Workspace Backlog</h3>
        </div>
        <div className="placeholder-table-header">
          <div>Key</div>
          <div>Title</div>
          <div>Project</div>
          <div>Status</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-40</code></div>
          <div>Design new dashboard wireframes</div>
          <div>Gravity Core</div>
          <div style={{ color: '#f59e0b' }}>In Progress</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-41</code></div>
          <div>Setup Elasticsearch cluster</div>
          <div>Infrastructure</div>
          <div style={{ color: '#ef4444' }}>Todo</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-42</code></div>
          <div>OAuth2 login flow integration</div>
          <div>Security Module</div>
          <div style={{ color: '#10b981' }}>Done</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-43</code></div>
          <div>Implement end-to-end integration suite</div>
          <div>Gravity Core</div>
          <div style={{ color: '#3b82f6' }}>In Review</div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
