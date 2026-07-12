import { isValidElement, type ReactNode } from 'react';

type PropertyBag = Record<PropertyKey, unknown>;

function isPropertyBag(value: unknown): value is PropertyBag {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

/**
 * Reads an own property from an arbitrary row without assuming it has an index
 * signature. Columns may use dynamically supplied string keys, so a missing
 * key deliberately renders as an empty cell rather than reading a prototype
 * property.
 */
export function getCellValue(row: unknown, key: PropertyKey): unknown {
  if (!isPropertyBag(row) || !Object.hasOwn(row, key)) {
    return undefined;
  }

  return row[key];
}

/**
 * Coerces an arbitrary cell value into something React can render when a column
 * has no custom `render`. Primitives (and null/undefined) are already valid
 * ReactNodes, React elements pass through, and anything else is stringified so a
 * stray object value can't crash the grid at render time.
 */
export function renderCellValue(value: unknown): ReactNode {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return value;
  }

  if (isValidElement(value)) {
    return value;
  }

  return String(value);
}
