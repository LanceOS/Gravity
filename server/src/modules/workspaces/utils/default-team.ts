export const DEFAULT_TEAM_NAME = 'General';
export const DEFAULT_TEAM_DESCRIPTION = 'Default team for workspace';
export const DEFAULT_TEAM_COLOR = '#6B7280';

export function getDefaultTeamId(workspaceId: string) {
  return `team-general-${workspaceId}`;
}
