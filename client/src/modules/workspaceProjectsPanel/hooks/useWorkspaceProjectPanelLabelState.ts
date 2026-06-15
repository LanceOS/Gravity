import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Label, Project } from '../../../../context/TicketContext';
import { DEFAULT_LABEL_COLOR, getNextLabelSortOrder } from '../utils/WorkspaceProjectPanel';

export interface UseWorkspaceProjectPanelLabelStateArgs {
  labels: Label[];
  managedProject: Project | null;
  shouldShowLabels: boolean;
}

export interface UseWorkspaceProjectPanelLabelStateResult {
  isCreateModalOpen: boolean;
  setIsCreateModalOpen: (open: boolean) => void;
  labelName: string;
  setLabelName: (name: string) => void;
  labelColor: string;
  setLabelColor: (color: string) => void;
  labelDescription: string;
  setLabelDescription: (description: string) => void;
  labelFormError: string | null;
  setLabelFormError: (message: string | null) => void;
  editingLabelId: string | null;
  setEditingLabelId: (labelId: string | null) => void;
  editingLabelName: string;
  setEditingLabelName: (name: string) => void;
  editingLabelColor: string;
  setEditingLabelColor: (color: string) => void;
  editingLabelDescription: string;
  setEditingLabelDescription: (description: string) => void;
  editingLabelError: string | null;
  setEditingLabelError: (message: string | null) => void;
  editingLabelLoading: boolean;
  setEditingLabelLoading: (loading: boolean) => void;
  sortedLabels: Label[];
  activeLabel: Label | null;
  nextLabelSortOrder: number;
  clearLabelEditor: () => void;
}

export function useWorkspaceProjectPanelLabelState({
  labels,
  managedProject,
  shouldShowLabels,
}: UseWorkspaceProjectPanelLabelStateArgs): UseWorkspaceProjectPanelLabelStateResult {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState(DEFAULT_LABEL_COLOR);
  const [labelDescription, setLabelDescription] = useState('');
  const [labelFormError, setLabelFormError] = useState<string | null>(null);
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [editingLabelName, setEditingLabelName] = useState('');
  const [editingLabelColor, setEditingLabelColor] = useState(DEFAULT_LABEL_COLOR);
  const [editingLabelDescription, setEditingLabelDescription] = useState('');
  const [editingLabelError, setEditingLabelError] = useState<string | null>(null);
  const [editingLabelLoading, setEditingLabelLoading] = useState(false);

  const sortedLabels = useMemo(
    () => {
      if (!shouldShowLabels) {
        return [];
      }

      const labelsById = new Map<string, Label>();
      for (const label of labels) {
        labelsById.set(label.id, label);
      }

      return [...labelsById.values()].sort((first, second) => first.name.localeCompare(second.name));
    },
    [labels, shouldShowLabels]
  );

  const activeLabel = useMemo(
    () => (editingLabelId ? sortedLabels.find((label) => label.id === editingLabelId) || null : null),
    [editingLabelId, sortedLabels]
  );

  const nextLabelSortOrder = useMemo(
    () => (managedProject ? getNextLabelSortOrder(sortedLabels) : 0),
    [managedProject, sortedLabels]
  );

  const clearLabelEditor = useCallback(() => {
    setEditingLabelId(null);
    setEditingLabelName('');
    setEditingLabelColor(DEFAULT_LABEL_COLOR);
    setEditingLabelDescription('');
    setEditingLabelError(null);
  }, []);

  useEffect(() => {
    if (!editingLabelId) {
      return;
    }

    const nextLabel = sortedLabels.find((label) => label.id === editingLabelId);
    if (!nextLabel) {
      clearLabelEditor();
      return;
    }

    setEditingLabelName(nextLabel.name);
    setEditingLabelColor(nextLabel.color);
    setEditingLabelDescription(nextLabel.description || '');
  }, [clearLabelEditor, editingLabelId, sortedLabels]);

  return {
    isCreateModalOpen,
    setIsCreateModalOpen,
    labelName,
    setLabelName,
    labelColor,
    setLabelColor,
    labelDescription,
    setLabelDescription,
    labelFormError,
    setLabelFormError,
    editingLabelId,
    setEditingLabelId,
    editingLabelName,
    setEditingLabelName,
    editingLabelColor,
    setEditingLabelColor,
    editingLabelDescription,
    setEditingLabelDescription,
    editingLabelError,
    setEditingLabelError,
    editingLabelLoading,
    setEditingLabelLoading,
    sortedLabels,
    activeLabel,
    nextLabelSortOrder,
    clearLabelEditor,
  };
}
