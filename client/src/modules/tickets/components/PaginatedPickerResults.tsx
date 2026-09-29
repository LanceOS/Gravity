import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

const PICKER_PAGE_SIZE = 50;
const rowSelector = '[role="menuitem"], input[type="checkbox"], button';

/** Native row semantics are retained; only the current page is mounted. */
export function PaginatedPickerResults<T>({ items, children, emptyLabel, maxHeight, menu = false }: {
  items: T[];
  children: (item: T) => ReactNode;
  emptyLabel: string;
  maxHeight: number;
  menu?: boolean;
}) {
  const [pagination, setPagination] = useState({ items, page: 0 });
  // Reset synchronously when the search or authorized dataset changes.
  if (pagination.items !== items) setPagination({ items, page: 0 });
  const page = pagination.items === items ? pagination.page : 0;
  const start = page * PICKER_PAGE_SIZE;
  const end = Math.min(start + PICKER_PAGE_SIZE, items.length);
  const rowsRef = useRef<HTMLDivElement>(null);
  const focusedElement = useRef<HTMLElement | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const statusId = useId();
  const rowsId = useId();
  const focusRow = (index: number) => {
    const row = rowsRef.current?.querySelectorAll<HTMLElement>(rowSelector)[index];
    row?.focus();
    row?.scrollIntoView({ block: 'nearest' });
  };
  const navigate = (index: number) => {
    const nextPage = Math.floor(index / PICKER_PAGE_SIZE);
    if (nextPage === page) focusRow(index - start);
    else {
      pendingFocus.current = index % PICKER_PAGE_SIZE;
      setPagination({ items, page: nextPage });
    }
  };
  useLayoutEffect(() => {
    if (pendingFocus.current !== null) {
      focusRow(pendingFocus.current);
      pendingFocus.current = null;
    } else if (focusedElement.current && !focusedElement.current.isConnected
      && document.activeElement === document.body) {
      if (items.length) focusRow(0);
      else rowsRef.current?.closest('[data-ticket-picker]')?.querySelector<HTMLInputElement>('input[type="text"]')?.focus();
    }
  });

  return <div onFocusCapture={(event) => { focusedElement.current = event.target as HTMLElement; }}
    onBlurCapture={(event) => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focusedElement.current = null;
    }} onKeyDownCapture={(event) => {
    const rows = Array.from(rowsRef.current?.querySelectorAll<HTMLElement>(rowSelector) ?? []);
    const localIndex = rows.indexOf(event.target as HTMLElement);
    if (localIndex < 0 || !items.length) {
      // Paging buttons sit outside the rows; keep menu ancestors from stealing arrows.
      if (menu && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        if (items.length) navigate(event.key === 'ArrowUp' || event.key === 'End' ? end - 1 : start);
      }
      return;
    }
    const index = start + localIndex;
    let target: number;
    switch (event.key) {
      case 'ArrowDown': target = Math.min(items.length - 1, index + 1); break;
      case 'ArrowUp': target = Math.max(0, index - 1); break;
      case 'Home': target = 0; break;
      case 'End': target = items.length - 1; break;
      case 'PageDown': target = Math.min(items.length - 1, index + PICKER_PAGE_SIZE); break;
      case 'PageUp': target = Math.max(0, index - PICKER_PAGE_SIZE); break;
      default: return;
    }
    event.preventDefault();
    event.stopPropagation();
    navigate(target);
  }}>
    <div id={rowsId} ref={rowsRef} aria-describedby={statusId}
      style={{ maxHeight, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 4, margin: '4px 0' }}>
      {items.length ? items.slice(start, end).map(children) : <div style={{ fontSize: 11, padding: '8px 0', textAlign: 'center' }}>{emptyLabel}</div>}
    </div>
    <div id={statusId} role="status" aria-live="polite" aria-atomic="true" style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
      {items.length ? `Showing ${start + 1}–${end} of ${items.length}` : 'No results'}
    </div>
    {items.length > PICKER_PAGE_SIZE && <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
      <button type="button" role={menu ? 'menuitem' : undefined} aria-controls={rowsId}
        disabled={page === 0} onClick={() => navigate(start - PICKER_PAGE_SIZE)}>Previous page</button>
      <button type="button" role={menu ? 'menuitem' : undefined} aria-controls={rowsId}
        disabled={end === items.length} onClick={() => navigate(end)}>Next page</button>
    </div>}
  </div>;
}
