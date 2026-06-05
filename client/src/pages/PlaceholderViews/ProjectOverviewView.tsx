import React from 'react';
import { useParams } from 'react-router-dom';
import { PlaceholderLayout } from './PlaceholderLayout';

export default function ProjectOverviewView() {
  const params = useParams();
  const { workspaceId, teamId, projectId } = params;

  return (
    <PlaceholderLayout
      breadcrumbs={[{ label: 'Teams' }, { label: teamId || 'Team' }, { label: 'Projects' }, { label: projectId || 'Project' }]}
      title={`Project Overview: ${projectId}`}
      description={`High level project overview, deliverables, and schedules for project ${projectId}.`}
      params={params}
      degradation={{
        message: 'This workspace does not use team-level projects. Redirecting to individual project tickets.',
        targetPath: `/workspaces/${workspaceId}/projects/${projectId}/tickets`,
        targetLabel: 'Project Tickets',
      }}
    >
      <div className="placeholder-grid">
        <div className="placeholder-card">
          <div className="card-title">Completed Work</div>
          <div className="card-value">64%</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Active Milestones</div>
          <div className="card-value">2 / 3</div>
        </div>
        <div className="placeholder-card">
          <div className="card-title">Pending PRs</div>
          <div className="card-value">5</div>
        </div>
      </div>
    </PlaceholderLayout>
  );
}
