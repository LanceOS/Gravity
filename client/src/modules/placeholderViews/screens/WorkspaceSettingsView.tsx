import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from '../../../layouts/PlaceholderLayout/PlaceholderLayout';

export default function WorkspaceSettingsView() {
  const params = useParams();
  const { workspaceId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Workspace' }, { label: 'Settings' }]}
      title="Workspace Settings"
      description={`Manage preferences, members, and API integrations for workspace ${workspaceId}.`}
      params={params}
    >
      <div className="placeholder-card">
        <h3 style={{ fontSize: '15px', color: '#fff', marginBottom: '16px' }}>General Configuration</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#fff' }}>Allow Peer Invites</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Allow members of this workspace to invite teammates.</div>
            </div>
            <input type="checkbox" defaultChecked style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#fff' }}>Require Join Approval</div>
              <div style={{ fontSize: '12px', color: '#64748b' }}>Admin must approve users requesting to join.</div>
            </div>
            <input type="checkbox" style={{ width: '18px', height: '18px', cursor: 'pointer' }} />
          </div>
        </div>
      </div>
    ../../../layouts/PlaceholderLayout/PlaceholderLayout>
  );
}
