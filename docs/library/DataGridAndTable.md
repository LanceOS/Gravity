# DataGrid and Table identity

Both components require `getRowKey(row)`, returning a stable React key unique
within the data. Use a database ID or immutable domain identifier, including for
new object instances representing the same row. Do not use a position, random
value, or editable display text. Existing callers must supply this callback:

```tsx
<Table columns={columns} data={tickets} getRowKey={ticket => ticket.id} />
<DataGrid columns={columns} data={tickets} getRowKey={ticket => ticket.id} />
```

`ColumnConfig.key` identifies both the header and every cell in that column.
Its string representation must be unique among columns and stable when labels,
widths, or ordering change. Custom render-only columns also need distinct keys.

Reordering rows or columns preserves mounted cell state and DOM identity.
Filtering a row or hiding a column unmounts its cells; restoring it creates fresh
state. DataGrid also unmounts rows outside its buffered viewport, so edits that
must survive scrolling out of view should be stored outside the cell component.
Row positions still control virtual layout, but never React identity.

Sorting and filtering are supplied through `data`; column visibility and widths
are supplied through `columns`. These components do not expose built-in sorting,
selection, or drag-resizing controls.

Regression coverage: `client/src/test/library/data-grid-table-identity.test.tsx`
checks DOM identity, unsaved input state, focus, immutable row updates, column
changes, virtual row positioning, and scroll-window recovery after data shrinks.
Existing display and windowing tests cover rendering, interactions, and viewport
resizing.
