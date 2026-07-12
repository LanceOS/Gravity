import { isValidElement, type ReactNode, type ReactPortal } from 'react';

type PropertyBag = Record<PropertyKey, unknown>;
const REACT_PORTAL_TYPE = Symbol.for('react.portal');
// Bounds hostile proxy chains while comfortably exceeding ordinary class inheritance depth.
const MAX_PROTOTYPE_DEPTH = 32;
const NATIVE_FUNCTION = /\{\s*\[native code\]\s*\}$/;

function isPropertyBag(value: unknown): value is PropertyBag {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

function isUserDefinedGetter(descriptor: PropertyDescriptor): boolean {
  const getter = descriptor.get;

  if (typeof getter !== 'function') {
    return false;
  }

  try {
    return !NATIVE_FUNCTION.test(Function.prototype.toString.call(getter));
  } catch {
    return false;
  }
}

function hasColumnKey(row: PropertyBag, key: PropertyKey): boolean {
  try {
    if (!Reflect.has(row, key)) {
      return false;
    }

    const visited = new WeakSet<object>();
    let current: object | null = row;

    for (let depth = 0; current !== null && depth < MAX_PROTOTYPE_DEPTH; depth += 1) {
      if (visited.has(current)) {
        return false;
      }

      visited.add(current);
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor) {
        return current === row || isUserDefinedGetter(descriptor);
      }

      current = Object.getPrototypeOf(current);
    }

    return current === null;
  } catch {
    return false;
  }
}

/**
 * Reads a property from an arbitrary row without assuming it has an index
 * signature. Own keys and custom prototype getters are supported. Inherited
 * methods, native members, and unsafe prototype traversals are ignored for
 * dynamically supplied keys.
 */
export function getCellValue(row: unknown, key: PropertyKey): unknown {
  if (!isPropertyBag(row) || !hasColumnKey(row, key)) {
    return undefined;
  }

  return row[key];
}

function isReactPortal(value: unknown): value is ReactPortal {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$$typeof' in value &&
    value.$$typeof === REACT_PORTAL_TYPE
  );
}

function isIterable(value: unknown): value is Iterable<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Symbol.iterator in value &&
    typeof value[Symbol.iterator] === 'function'
  );
}

function renderIterable(value: unknown): ReactNode[] | undefined {
  try {
    return isIterable(value) ? Array.from(value, (item) => renderCellValue(item)) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Coerces an arbitrary cell value into something React can render when a column
 * has no custom `render`. Primitives, React elements, portals, and iterables
 * are valid ReactNodes. Unsupported values are stringified so a stray object
 * value cannot crash the grid at render time.
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

  if (isValidElement(value) || isReactPortal(value)) {
    return value;
  }

  const iterable = renderIterable(value);
  if (iterable !== undefined) {
    return iterable;
  }

  return String(value);
}
