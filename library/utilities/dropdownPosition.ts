export type DropdownPlacement = 'above' | 'below';
export type DropdownAlign = 'left' | 'right' | 'center';

export interface DropdownPositionInput {
  triggerRect: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>;
  floatingRect: Pick<DOMRect, 'width' | 'height'>;
  align?: DropdownAlign;
  gap?: number;
  viewportPadding?: number;
  viewportWidth?: number;
  viewportHeight?: number;
  fallbackWidth?: number;
  fallbackHeight?: number;
}

export interface DropdownPosition {
  left: number;
  top: number;
  maxHeight: number;
  placement: DropdownPlacement;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getDropdownPosition({
  triggerRect,
  floatingRect,
  align = 'left',
  gap = 4,
  viewportPadding = 16,
  viewportWidth,
  viewportHeight,
  fallbackWidth,
  fallbackHeight,
}: DropdownPositionInput): DropdownPosition {
  const resolvedViewportWidth = viewportWidth ?? (typeof window !== 'undefined' ? window.innerWidth : 0);
  const resolvedViewportHeight = viewportHeight ?? (typeof window !== 'undefined' ? window.innerHeight : 0);
  const floatingWidth = floatingRect.width || fallbackWidth || triggerRect.width;
  const floatingHeight = floatingRect.height || fallbackHeight || 0;

  const spaceAbove = Math.max(0, triggerRect.top - gap - viewportPadding);
  const spaceBelow = Math.max(0, resolvedViewportHeight - triggerRect.bottom - gap - viewportPadding);
  const openAbove = spaceBelow < floatingHeight && spaceAbove > spaceBelow;
  const placement: DropdownPlacement = openAbove ? 'above' : 'below';
  const maxHeight = placement === 'above' ? spaceAbove : spaceBelow;

  let left = triggerRect.left;

  if (align === 'right') {
    left = triggerRect.right - floatingWidth;
  } else if (align === 'center') {
    left = triggerRect.left + (triggerRect.width / 2) - (floatingWidth / 2);
  }

  const maxLeft = resolvedViewportWidth - floatingWidth - viewportPadding;
  left = maxLeft < viewportPadding ? viewportPadding : clamp(left, viewportPadding, maxLeft);

  const visibleHeight = Math.min(floatingHeight || maxHeight, maxHeight);
  const top = placement === 'above'
    ? triggerRect.top - gap - visibleHeight
    : triggerRect.bottom + gap;

  return {
    left,
    top,
    maxHeight,
    placement,
  };
}
