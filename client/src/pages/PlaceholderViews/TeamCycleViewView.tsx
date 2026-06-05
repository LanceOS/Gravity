import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from './PlaceholderLayout';

export default function TeamCycleViewView() {
  const params = useParams();
  const { workspaceId, teamId, cycleId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Teams' }, { label: teamId || 'Team' }, { label: 'Cycles' }, { label: cycleId || 'Cycle' }]}
      title={`Active Cycle: ${cycleId}`}
      description="Cycle burndown stats, scope changes, and remaining story points."
      params={params}
      degradation={{
        message: 'This workspace does not currently use cycles/teams. Showing a template cycle board.',
        targetPath: `/workspaces/${workspaceId}/all`,
        targetLabel: 'Workspace All Tasks',
      }}
    >
      <div className="placeholder-grid">
        <div className="placeholder-card">
          <div className="card-title">Completed Points</div>
          <div className="card-value">28 / 36</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Scope Added</div>
          <div className="card-value">+4 pts</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Days Remaining</div>
          <div className="card-value">4 days</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', marginBottom: '32px' }}>
        <div className="placeholder-card">
          <div className="card-title">Cycle Burndown Chart</div>
          <div className="chart-container">
            <svg viewBox="0 0 500 200" style={{ width: '100%', height: '200px', background: 'transparent' }}>
              {/* Ideal Burndown Line */}
              <line x1="40" y1="20" x2="460" y2="180" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="2" strokeDasharray="5,5" />
              
              {/* Actual Burndown Path */}
              <path 
                d="M 40 20 L 100 20 L 160 50 L 220 80 L 280 80 L 340 110 L 400 130" 
                fill="none" 
                stroke="#6366f1" 
                strokeWidth="3" 
              />
              
              {/* Actual Burndown Dots */}
              <circle cx="40" cy="20" r="4" fill="#a78bfa" />
              <circle cx="100" cy="20" r="4" fill="#a78bfa" />
              <circle cx="160" cy="50" r="4" fill="#a78bfa" />
              <circle cx="220" cy="80" r="4" fill="#a78bfa" />
              <circle cx="280" cy="80" r="4" fill="#a78bfa" />
              <circle cx="340" cy="110" r="4" fill="#a78bfa" />
              <circle cx="400" cy="130" r="4" fill="#a78bfa" />
              
              {/* Grid Lines */}
              <line x1="40" y1="180" x2="460" y2="180" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
              <line x1="40" y1="20" x2="40" y2="180" stroke="rgba(255, 255, 255, 0.1)" strokeWidth="1" />
            </svg>
          </div>
        </div>

        <div className="placeholder-card">
          <div className="card-title">Cycle Contributors</div>
          <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }}>
            <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Lance OS</span>
              <span style={{ fontWeight: 600 }}>18 pts completed</span>
            </li>
            <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span>Jane Dev</span>
              <span style={{ fontWeight: 600 }}>10 pts completed</span>
            </li>
          </ul>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
