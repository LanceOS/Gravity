import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from './PlaceholderLayout';

export default function WorkspaceExportView() {
  const params = useParams();
  const { workspaceId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Workspace' }, { label: 'Settings', path: `/workspaces/${workspaceId}/settings` }, { label: 'Export' }]}
      title="Export Data"
      description="Download workspace ticket backlogs, activity comments, and project note documents."
      params={params}
    >
      <div className="placeholder-card">
        <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '16px' }}>Select Format</h3>
        <div style={{ display: 'flex', gap: '16px', marginBottom: '24px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="radio" name="format" defaultChecked />
            <span>JSON (Full Backup)</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input type="radio" name="format" />
            <span>CSV (Spreadsheet friendly)</span>
          </label>
        </div>
        
        <button className="degradation-btn" style={{ background: '#6366f1', color: '#fff' }}>
          Start Export Action
        </button>
      </div>
    </PlaceholderLayout>
  );
}
