import type { Label } from '../../types/domain';

export interface LabelContextType {
  labels: Label[];
  labelsByProject: Map<string, Label[]>;
  globalLabels: Label[];
  createLabel: (label: { name: string; color?: string; description?: string; projectId?: string; sortOrder?: number }) => Promise<Label | null>;
  updateLabel: (id: string, updates: Partial<Label>) => Promise<Label | null>;
  deleteLabel: (id: string) => Promise<boolean>;
  assignLabelToTicket: (ticketId: string, labelId: string) => Promise<boolean>;
  unassignLabelFromTicket: (ticketId: string, labelId: string) => Promise<boolean>;
  findLabelQueryKey: (labelId: string) => readonly unknown[] | null;
  invalidateLabelQueries: (labelId: string, projectId?: string | null) => void;
}
