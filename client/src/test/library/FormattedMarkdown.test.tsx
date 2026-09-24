import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormattedMarkdown } from '@library/components/aichat/FormattedMarkdown';

describe('FormattedMarkdown updates', () => {
  it('skips unchanged message parsing while still rendering new content and token renderers', () => {
    const customTokenRegex = /@(\w+)/g;
    const renderCustomToken = vi.fn((match: RegExpMatchArray, key: number) => (
      <span key={key}>{match[0]}</span>
    ));
    const props = { text: 'Hello @alice', customTokenRegex, renderCustomToken };
    const { rerender } = render(<FormattedMarkdown {...props} />);

    expect(renderCustomToken).toHaveBeenCalledTimes(1);
    // Parent updates (typing, focus, or another streamed message) retain these props.
    rerender(<FormattedMarkdown {...props} />);
    expect(renderCustomToken).toHaveBeenCalledTimes(1);

    rerender(<FormattedMarkdown {...props} text="Hello @bob" />);
    expect(screen.getByText('@bob')).toBeInTheDocument();
    expect(screen.queryByText('@alice')).toBeNull();
    expect(renderCustomToken).toHaveBeenCalledTimes(2);

    const nextRenderer = vi.fn((match: RegExpMatchArray, key: number) => (
      <strong key={key}>New renderer: {match[0]}</strong>
    ));
    rerender(<FormattedMarkdown {...props} text="Hello @bob" renderCustomToken={nextRenderer} />);
    expect(screen.getByText('New renderer: @bob')).toBeInTheDocument();
    expect(nextRenderer).toHaveBeenCalledTimes(1);
  });

  it('updates message tone when the text is unchanged', () => {
    const { container, rerender } = render(<FormattedMarkdown text="**Hello**" />);
    rerender(<FormattedMarkdown text="**Hello**" tone="accent" />);

    expect((container.querySelector('.markdown-renderer') as HTMLElement).style.color)
      .toBe('var(--color-text-on-accent)');
    expect(screen.getByText('Hello').style.color).toBe('var(--color-text-on-accent)');
  });
});
