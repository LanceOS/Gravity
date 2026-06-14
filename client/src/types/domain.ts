import type { Label } from './label';
export type { Label };

/**
 * Shared entity types for the app's data model.
 *
 * These types reflect the backend API contract and are intentionally decoupled
 * from React context machinery. Import from here (or from `src/context/TicketContext`
 * which re-exports everything) — both paths resolve identically.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  tutorial_completed?: number | boolean;
}

export interface Team {
  id: string;
  workspaceId: string;
  name: string;
  description: string;
  color: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SidebarView {
  id: string;
  name: string;
  type: string;
}

export interface SidebarTeam {
  id: string;
  name: string;
  description: string;
  color: string;
  views: SidebarView[];
  cycles: Cycle[];
  labels?: Label[];
  projects: Project[];
}

export interface SidebarTree {
  workspaceId: string;
  hierarchyMode?: 'flat' | 'teams';
  teams: SidebarTeam[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  key: string;
  status: 'planned' | 'active' | 'completed';
  workspaceId?: string | null;
  githubRepoUrl?: string | null;
  teamId?: string | null;
}

export type CreateProjectInput = {
  name: string;
  description: string;
  key: string;
  status?: Project['status'];
  workspaceId?: string;
  teamId?: string;
};

export interface Domain {
  id: string;
  name: string;
  color: string;
}

export interface Cycle {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  completed: number;
}

export interface Ticket {
  id: string;
  key: string;
  title: string;
  description: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done' | 'canceled';
  priority: 'no_priority' | 'low' | 'medium' | 'high' | 'urgent';
  assigneeId: string | null;
  projectId: string;
  domainId?: string | null; // Keep for now during migration transition
  labels?: Label[];
  labelIds?: string[];
  cycleId: string | null;
  parentId: string | null;
  prStatus: 'open' | 'merged' | 'closed' | 'none';
  prUrl: string | null;
  branchName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  ticketId: string;
  userId: string;
  body: string;
  createdAt: string;
  userName?: string;
  userAvatar?: string;
  author?: {
    id: string;
    username: string;
    avatar_url?: string;
    role?: string;
  };
}
