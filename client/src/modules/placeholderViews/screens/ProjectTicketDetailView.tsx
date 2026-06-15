import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from '../../../layouts/PlaceholderLayout/PlaceholderLayout';

export default function ProjectTicketDetailView() {
  const params = useParams();
  const { projectId, ticketKey } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[
        { label: 'Projects' }, 
        { label: projectId || 'Project', path: `/workspaces/${params.workspaceId}/projects/${projectId}/tickets` }, 
        { label: 'Tickets' }, 
        { label: ticketKey || 'Ticket' }
      ]}
      title={`Ticket Detail: ${ticketKey}`}
      description={`Viewing ticket key ${ticketKey} in project ${projectId}.`}
      params={params}
    >
      <div className="placeholder-card" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '18px', color: '#fff', marginBottom: '16px' }}>
          Define all application routes based on URL structure
        </h2>
        <p style={{ color: '#cbd5e1', lineHeight: 1.6, fontSize: '14px', marginBottom: '24px' }}>
          We need to map out every single application view to a clean, query/parameter-friendly URL route setup 
          so that developers can share direct links to tickets, notes, and cycle dashboards.
        </p>

        <div style={{ display: 'flex', gap: '16px' }}>
          <span className="placeholder-badge" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444' }}>
            Priority: Urgent
          </span>
          <span className="placeholder-badge" style={{ background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#f59e0b' }}>
            Status: In Progress
          </span>
        </div>
      </div>

      <div className="placeholder-table-wrapper">
        <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
          <h3 style={{ fontSize: '14px', color: '#fff' }}>Activity Thread</h3>
        </div>
        <div className="placeholder-table-row" style={{ gridTemplateColumns: '120px 1fr 120px' }}>
          <div style={{ fontWeight: 600 }}>Jane Dev</div>
          <div>Working on placeholder components now.</div>
          <div style={{ color: '#64748b', fontSize: '12px' }}>10m ago</div>
        </div>
        <div className="placeholder-table-row" style={{ gridTemplateColumns: '120px 1fr 120px' }}>
          <div style={{ fontWeight: 600 }}>Lance OS</div>
          <div>Created the implementation plan.</div>
          <div style={{ color: '#64748b', fontSize: '12px' }}>1h ago</div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
