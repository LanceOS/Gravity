import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from '../../../layouts/PlaceholderLayout/PlaceholderLayout';

export default function ProjectNotesListView() {
  const params = useParams();
  const { projectId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Projects' }, { label: projectId || 'Project' }, { label: 'Notes' }]}
      title="Project Notes"
      description={`Collaborative document notes for project ${projectId}.`}
      params={params}
    >
      <div className="placeholder-grid">
        <div className="placeholder-card">
          <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '8px' }}>E2E Test Architecture Notes</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
            Guidelines for running MSW and JSDOM integrations for frontend testing.
          </p>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Last updated: 2h ago</span>
        </div>
        <div className="placeholder-card">
          <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '8px' }}>Release Checklist v0.7</h3>
          <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px', lineHeight: 1.5 }}>
            Task list for shipping CSS Cascade layers, routing setups, and login preference caches.
          </p>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Last updated: 1d ago</span>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
