import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from './PlaceholderLayout';

export default function ProjectNoteDetailView() {
  const params = useParams();
  const { projectId, noteId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[
        { label: 'Projects' }, 
        { label: projectId || 'Project', path: `/workspaces/${params.workspaceId}/projects/${projectId}/notes` }, 
        { label: 'Notes' }, 
        { label: noteId || 'Note' }
      ]}
      title={`Note Editor: ${noteId}`}
      description={`Editing note document ${noteId} for project ${projectId}.`}
      params={params}
    >
      <div className="placeholder-card" style={{ background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '16px' }}>
          <span style={{ fontSize: '18px', fontWeight: 600, color: '#fff' }}>E2E Test Architecture Notes</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Autosaved 1m ago</span>
        </div>
        
        <div style={{ minHeight: '200px', fontSize: '14px', color: '#cbd5e1', lineHeight: 1.8 }}>
          <p style={{ marginBottom: '16px' }}>
            We use a shared <code>dbState</code> object in in-memory space for E2E user-flow simulations. 
            All mock fetch API requests resolve using the router defined in setup.ts.
          </p>
          <h4 style={{ color: '#fff', fontSize: '14px', fontWeight: 600, margin: '20px 0 10px 0' }}>Testing command list:</h4>
          <ul style={{ paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <li><code>npm run test</code> - Runs Vitest unit & integration tests</li>
            <li><code>npm run test:e2e</code> - Runs E2E JSDOM setup test files</li>
          </ul>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
