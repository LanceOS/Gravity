import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from './PlaceholderLayout';

export default function TeamOverviewView() {
  const params = useParams();
  const { workspaceId, teamId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Teams' }, { label: teamId || 'Team' }, { label: 'Overview' }]}
      title={`Team Overview: ${teamId}`}
      description="Overview dashboard showing team health metrics, active cycles, and projects."
      params={params}
      degradation={{
        message: 'This workspace does not currently use teams. Access to team views is mocked for design review purposes.',
        targetPath: `/workspaces/${workspaceId}/all`,
        targetLabel: 'Workspace All Tasks',
      }}
    >
      <div className="placeholder-grid">
        <div className="placeholder-card">
          <div className="card-title">Velocity</div>
          <div className="card-value">42 pts</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Cycle Completion</div>
          <div className="card-value">88%</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Active Projects</div>
          <div className="card-value">3</div>
        </div>
      </div>

      <div className="placeholder-table-wrapper">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <h3 style={{ fontSize: '15px', color: '#fff' }}>Team Members</h3>
        </div>
        <div className="placeholder-table-header">
          <div>Name</div>
          <div>Role</div>
          <div>Status</div>
          <div>Allocated Projects</div>
        </div>
        <div className="placeholder-table-row">
          <div>Jane Developer</div>
          <div>Tech Lead</div>
          <div style={{ color: '#10b981' }}>Active</div>
          <div>Gravity Core, Security</div>
        </div>
        <div className="placeholder-table-row">
          <div>Lance OS</div>
          <div>Fullstack Engineer</div>
          <div style={{ color: '#10b981' }}>Active</div>
          <div>Gravity Core</div>
        </div>
        <div className="placeholder-table-row">
          <div>Sarah Manager</div>
          <div>Product Owner</div>
          <div style={{ color: '#f59e0b' }}>In Meeting</div>
          <div>Gravity Core, Analytics</div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
