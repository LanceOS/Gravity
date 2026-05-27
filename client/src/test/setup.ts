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

if (!document.elementFromPoint) {
  document.elementFromPoint = () => null;
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

if (typeof Range !== 'undefined') {
  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => emptyDOMRectList;
  }

  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => emptyDOMRect;
  }
}

if (typeof Text !== 'undefined') {
  if (!(Text.prototype as any).getClientRects) {
    (Text.prototype as any).getClientRects = () => emptyDOMRectList;
  }

  if (!(Text.prototype as any).getBoundingClientRect) {
    (Text.prototype as any).getBoundingClientRect = () => emptyDOMRect;
  }
}

afterEach(() => {
  cleanup();
});