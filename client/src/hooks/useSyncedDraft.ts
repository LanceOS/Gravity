import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

interface UseSyncedDraftStateArgs<TItem extends { id: string }, TDraft> {
  selectedItem: TItem | null;
  getDefaultDraft: () => TDraft;
  getDraftFromItem: (item: TItem | null) => TDraft;
}

export interface UseSyncedDraftStateResult<TItem extends { id: string }, TDraft> {
  draft: TDraft;
  setDraft: Dispatch<SetStateAction<TDraft>>;
  resetDraft: () => void;
  resetDraftToItem: (item: TItem | null) => void;
}

export function useSyncedDraftState<TItem extends { id: string }, TDraft>({
  selectedItem,
  getDefaultDraft,
  getDraftFromItem,
}: UseSyncedDraftStateArgs<TItem, TDraft>): UseSyncedDraftStateResult<TItem, TDraft> {
  const [draft, setDraft] = useState<TDraft>(getDefaultDraft);
  const lastSelectedItemIdRef = useRef<string | null>(null);

  const syncDraftFromItem = useCallback(
    (item: TItem | null) => {
      setDraft(getDraftFromItem(item));
      lastSelectedItemIdRef.current = item?.id ?? null;
    },
    [getDraftFromItem],
  );

  useEffect(() => {
    const selectedItemId = selectedItem?.id ?? null;
    if (selectedItemId === lastSelectedItemIdRef.current) {
      return;
    }

    syncDraftFromItem(selectedItem);
  }, [selectedItem, syncDraftFromItem]);

  const resetDraftToItem = useCallback(
    (item: TItem | null) => {
      syncDraftFromItem(item);
    },
    [syncDraftFromItem],
  );

  const resetDraftToCurrentOrDefault = useCallback(() => {
    if (selectedItem) {
      syncDraftFromItem(selectedItem);
      return;
    }

    lastSelectedItemIdRef.current = null;
    setDraft(getDefaultDraft());
  }, [getDefaultDraft, selectedItem, syncDraftFromItem]);

  return {
    draft,
    setDraft,
    resetDraft: resetDraftToCurrentOrDefault,
    resetDraftToItem,
  };
}
