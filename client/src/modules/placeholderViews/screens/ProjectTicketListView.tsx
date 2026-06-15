import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from '../../../layouts/PlaceholderLayout/PlaceholderLayout';

export default function ProjectTicketListView() {
  const params = useParams();
  const { projectId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Projects' }, { label: projectId || 'Project' }, { label: 'Tickets' }]}
      title="Project Tickets"
      description={`Task tickets list for project ${projectId}.`}
      params={params}
    >
      <div className="placeholder-table-wrapper">
        <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <h3 style={{ fontSize: '15px', color: '#fff' }}>Ticket List</h3>
        </div>
        <div className="placeholder-table-header">
          <div>Key</div>
          <div>Title</div>
          <div>Priority</div>
          <div>Status</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-12</code></div>
          <div>Define route configuration file</div>
          <div style={{ color: '#ef4444' }}>High</div>
          <div style={{ color: '#f59e0b' }}>In Progress</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-13</code></div>
          <div>Create placeholder route components</div>
          <div style={{ color: '#fb7185' }}>Medium</div>
          <div style={{ color: '#ef4444' }}>Todo</div>
        </div>
        <div className="placeholder-table-row">
          <div><code>GRV-14</code></div>
          <div>Gracefully degrade team-based routes</div>
          <div style={{ color: '#38bdf8' }}>Low</div>
          <div style={{ color: '#ef4444' }}>Todo</div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
