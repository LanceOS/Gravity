import { apiClient } from '../utils/apiClient';

export type ReconciliationCandidate = {
  id: string; ticketId: string; ticketKey: string; ticketTitle: string;
  pull: { number: number; url: string; title: string; branch: string; state: string; mergedAt: string | null };
  evidence: string[]; confidence: 'explicit' | 'suggested'; conflicts: string[];
  protected: boolean; requiresReview: boolean; noChange: boolean;
  current: { status: string; prStatus: string; prUrl: string | null };
  proposed: { status: string; prStatus: string; prUrl: string };
};
export type ReconciliationPreview = {
  previewToken: string; expiresAt: number; repository: string;
  candidates: ReconciliationCandidate[]; pullCount: number; pagesFetched: number;
  incomplete: boolean; nextPage: number | null;
};
export type ReconciliationResult = { results: Array<{ candidateId: string; ticketKey: string; prNumber: number; outcome: string; reason?: string }> };
export const previewGithubReconciliation = (projectId: string, startPage: number, maxPages: number, credential: string) =>
  apiClient.post<ReconciliationPreview>(`/projects/${encodeURIComponent(projectId)}/github-reconciliation/preview`, { startPage, maxPages, credential });
export const applyGithubReconciliation = (projectId: string, previewToken: string, selections: Array<{ candidateId: string; reviewed: boolean }>, credential: string) =>
  apiClient.post<ReconciliationResult>(`/projects/${encodeURIComponent(projectId)}/github-reconciliation/apply`, { previewToken, selections, credential });
