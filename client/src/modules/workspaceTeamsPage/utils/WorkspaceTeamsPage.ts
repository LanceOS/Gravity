import type { SidebarTeam, Team } from '../../../types/domain';
import type { TeamDraft } from '../types/WorkspaceTeamsPage';

export const DEFAULT_TEAM_COLOR = '#3B82F6';

export const COLOR_OPTIONS = ['#3B82F6', '#10B981', '#F97316', '#EC4899', '#8B5CF6', '#64748B'];

export const TEAM_VIEWS: SidebarTeam['views'] = [
  { id: 'all', name: 'All Tasks', type: 'all' },
  { id: 'timeline', name: 'Timeline', type: 'timeline' },
];

export function getInitialDraft(): TeamDraft {
  return {
    name: '',
    description: '',
    color: DEFAULT_TEAM_COLOR,
  };
}

export function getTeamReferenceCount(team: SidebarTeam) {
  const teamLabels = team.labels ?? [];
  return (team.projects?.length ?? 0) + (team.cycles?.length ?? 0) + teamLabels.length;
}

export function toSidebarTeam(team: Team): SidebarTeam {
  return {
    id: team.id,
    name: team.name,
    description: team.description,
    color: team.color,
    views: TEAM_VIEWS,
    cycles: [],
    labels: [],
    projects: [],
  };
}
