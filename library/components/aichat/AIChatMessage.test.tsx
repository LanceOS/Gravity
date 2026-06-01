// @ts-nocheck
import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AIChatMessageBubble } from './AIChatMessage';

describe('AIChatMessageBubble', () => {
  it('applies wrapping styles to long continuous text', () => {
    const longText = 'https://' + 'a'.repeat(600) + '.com';
    const message = { role: 'assistant', content: longText } as any;

    const { container } = render(<AIChatMessageBubble message={message} />);
    const bubble = container.firstElementChild as HTMLElement | null;

    expect(bubble).toBeTruthy();

    if (bubble) {
      expect(bubble.style.whiteSpace).toBe('pre-wrap');
      // inline style should contain overflowWrap set to 'anywhere'
      expect(bubble.style.overflowWrap || bubble.style.getPropertyValue('overflow-wrap')).toBe('anywhere');
    }
  });
});
