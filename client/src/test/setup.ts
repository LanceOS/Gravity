import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

if (!window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = () => {};
}

function defineGeometryMethod(target: object, name: string, value: (...args: never[]) => unknown) {
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value,
  });
}

function defineGeometryMethodIfMissing(target: object, name: string, value: (...args: never[]) => unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(target, name);

  if (descriptor && typeof descriptor.value === 'function') {
    return;
  }

  defineGeometryMethod(target, name, value);
}

function emptyPointTarget(this: Document) {
  return this.body ?? this.documentElement ?? null;
}

if (typeof document !== 'undefined') {
  defineGeometryMethodIfMissing(
    document,
    'elementFromPoint',
    emptyPointTarget as unknown as (...args: never[]) => unknown,
  );
}

if (typeof Document !== 'undefined') {
  defineGeometryMethodIfMissing(
    Document.prototype,
    'elementFromPoint',
    emptyPointTarget as unknown as (...args: never[]) => unknown,
  );
}

if (typeof DocumentFragment !== 'undefined') {
  defineGeometryMethodIfMissing(
    DocumentFragment.prototype,
    'elementFromPoint',
    function () {
      return null;
    } as unknown as (...args: never[]) => unknown,
  );
}

if (typeof ShadowRoot !== 'undefined') {
  defineGeometryMethodIfMissing(
    ShadowRoot.prototype,
    'elementFromPoint',
    function (this: ShadowRoot) {
      return this.host ?? null;
    } as unknown as (...args: never[]) => unknown,
  );
}

const emptyDOMRectList = {
  item: () => null,
  length: 0,
  [Symbol.iterator]: function* iterator() {},
} as unknown as DOMRectList;

const emptyDOMRect = {
  bottom: 0,
  height: 0,
  left: 0,
  right: 0,
  top: 0,
  width: 0,
  x: 0,
  y: 0,
  toJSON: () => ({}),
} as DOMRect;

if (!HTMLElement.prototype.getClientRects) {
  HTMLElement.prototype.getClientRects = () => emptyDOMRectList;
}

if (!HTMLElement.prototype.getBoundingClientRect) {
  HTMLElement.prototype.getBoundingClientRect = () => emptyDOMRect;
}

if (typeof Element !== 'undefined') {
  defineGeometryMethod(Element.prototype, 'getClientRects', () => emptyDOMRectList);
  defineGeometryMethod(Element.prototype, 'getBoundingClientRect', () => emptyDOMRect);
}

if (typeof Node !== 'undefined') {
  defineGeometryMethod(Node.prototype, 'getClientRects', () => emptyDOMRectList);
  defineGeometryMethod(Node.prototype, 'getBoundingClientRect', () => emptyDOMRect);
}

if (typeof Range !== 'undefined') {
  defineGeometryMethod(Range.prototype, 'getClientRects', () => emptyDOMRectList);
  defineGeometryMethod(Range.prototype, 'getBoundingClientRect', () => emptyDOMRect);
}

if (typeof Text !== 'undefined') {
  defineGeometryMethod(Text.prototype, 'getClientRects', () => emptyDOMRectList);
  defineGeometryMethod(Text.prototype, 'getBoundingClientRect', () => emptyDOMRect);
}

afterEach(() => {
  cleanup();
});