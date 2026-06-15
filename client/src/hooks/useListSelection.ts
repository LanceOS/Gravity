import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

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
  const lastActiveItemIdRef = useRef(activeItemId);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId) ?? null,
    [items, selectedItemId],
  );

  useEffect(() => {
    if (items.length === 0) {
      setSelectedItemId('');
      lastActiveItemIdRef.current = activeItemId;
      return;
    }

    const activeItemExists = !!activeItemId && items.some((item) => item.id === activeItemId);
    const selectedItemExists = !!selectedItemId && items.some((item) => item.id === selectedItemId);
    const activeItemChanged = lastActiveItemIdRef.current !== activeItemId;

    if (!selectedItemExists && activeItemExists) {
      setSelectedItemId(activeItemId);
      lastActiveItemIdRef.current = activeItemId;
      return;
    }

    if (activeItemChanged && activeItemExists) {
      setSelectedItemId(activeItemId);
      lastActiveItemIdRef.current = activeItemId;
      return;
    }

    if (!selectedItemExists) {
      setSelectedItemId(items[0].id);
    }

    lastActiveItemIdRef.current = activeItemId;
  }, [activeItemId, items, selectedItemId]);

  return {
    selectedItemId,
    setSelectedItemId,
    selectedItem,
  };
}
