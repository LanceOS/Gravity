import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AIChatMessageBubble } from '@library';

describe('AIChatMessageBubble', () => {
  it('keeps user message markdown aligned with the accent bubble color', () => {
    const { container } = render(
      <AIChatMessageBubble
        message={{ role: 'user', content: 'test' }}
      />
    );

    const bubble = container.firstElementChild as HTMLElement | null;
    const markdownRenderer = container.querySelector('.markdown-renderer') as HTMLElement | null;

    expect(bubble).toBeTruthy();
    expect(markdownRenderer).toBeTruthy();

    if (bubble && markdownRenderer) {
      expect(bubble.style.color).toBe('var(--color-text-on-accent)');
      expect(markdownRenderer.style.color).toBe('var(--color-text-on-accent)');
    }
  });
});
