import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from '../../../layouts/PlaceholderLayout/PlaceholderLayout';

export default function WorkspaceDashboardView() {
  const params = useParams();
  const { workspaceId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Workspace' }, { label: 'Dashboard' }]}
      title="Workspace Dashboard"
      description={`Overview statistics and summaries for workspace ${workspaceId}.`}
      params={params}
    >
      <div className="placeholder-grid">
        <div className="placeholder-card">
          <div className="card-title">Active Projects</div>
          <div className="card-value">12</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Total Members</div>
          <div className="card-value">45</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Open Tickets</div>
          <div className="card-value">158</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Completed (This Month)</div>
          <div className="card-value">342</div>
        </div>
      </div>

      <div className="placeholder-table-wrapper">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <h3 style={{ fontSize: '15px', color: '#fff' }}>Recent Workspace Activity</h3>
        </div>
        <div className="placeholder-table-header">
          <div>User</div>
          <div>Action</div>
          <div>Target</div>
          <div>Time</div>
        </div>
        <div className="placeholder-table-row">
          <div>Jane Dev</div>
          <div>Updated ticket status</div>
          <div><code>GRV-102</code></div>
          <div>3 mins ago</div>
        </div>
        <div className="placeholder-table-row">
          <div>Lance OS</div>
          <div>Created project</div>
          <div><code>Analytics Platform</code></div>
          <div>2 hours ago</div>
        </div>
        <div className="placeholder-table-row">
          <div>Sarah Project</div>
          <div>Joined workspace</div>
          <div><code>Gravity Team</code></div>
          <div>1 day ago</div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
