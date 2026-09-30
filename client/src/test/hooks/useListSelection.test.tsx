import { act, renderHook } from '@testing-library/react';
import { expect, it } from 'vitest';
import { useListSelection } from '../../hooks/useListSelection';

it('retains a manual selection until the active item changes, and reconciles removed items', () => {
  const items = [{ id: 'one' }, { id: 'two' }];
  const { result, rerender } = renderHook(props => useListSelection(props), {
    initialProps: { items, activeItemId: 'one' },
  });
  expect(result.current.selectedItem?.id).toBe('one');
  act(() => result.current.setSelectedItemId('two'));
  rerender({ items: [...items], activeItemId: 'one' });
  expect(result.current.selectedItem?.id).toBe('two');
  rerender({ items, activeItemId: 'two' });
  act(() => result.current.setSelectedItemId('one'));
  rerender({ items, activeItemId: 'one' });
  expect(result.current.selectedItem?.id).toBe('one');
  rerender({ items: [items[1]], activeItemId: 'one' });
  expect(result.current.selectedItem?.id).toBe('two');
  rerender({ items: [], activeItemId: 'one' });
  expect(result.current.selectedItemId).toBe('');
  expect(result.current.selectedItem).toBeNull();
});
