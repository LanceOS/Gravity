import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';

interface UseListSelectionArgs<Item extends { id: string }> {
  items: Item[];
  activeItemId?: string;
}

export interface UseListSelectionResult<Item extends { id: string }> {
  selectedItemId: string;
  setSelectedItemId: Dispatch<SetStateAction<string>>;
  selectedItem: Item | null;
}

export function useListSelection<Item extends { id: string }>({
  items,
  activeItemId,
}: UseListSelectionArgs<Item>): UseListSelectionResult<Item> {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [lastActiveItemId, setLastActiveItemId] = useState(activeItemId);
  const activeItemExists = !!activeItemId && items.some(item => item.id === activeItemId);
  const selectedItemExists = !!selectedItemId && items.some(item => item.id === selectedItemId);
  const nextSelectedId = !items.length ? ''
    : activeItemExists && (!selectedItemExists || lastActiveItemId !== activeItemId) ? activeItemId
    : selectedItemExists ? selectedItemId : items[0].id;
  if (lastActiveItemId !== activeItemId) setLastActiveItemId(activeItemId);
  if (nextSelectedId !== selectedItemId) setSelectedItemId(nextSelectedId);

  const selectedItem = useMemo(
    () => items.find(item => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  return {
    selectedItemId,
    setSelectedItemId,
    selectedItem,
  };
}
