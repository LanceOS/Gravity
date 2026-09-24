import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AIChatWindow } from '@library';

const animeMock = vi.hoisted(() => Object.assign(vi.fn(), { remove: vi.fn() }));
vi.mock('animejs', () => ({ default: animeMock }));

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('AIChatWindow', () => {
  it.each(['embedded', 'reduced motion'] as const)('restores visible styles when switching to %s mid-animation', (mode) => {
    vi.stubEnv('NODE_ENV', 'development');
    const props = { messages: [], onSendMessage: () => {} };
    const { container, rerender } = render(<AIChatWindow {...props} />);
    const chatWindow = container.firstElementChild as HTMLElement;
    chatWindow.style.opacity = '0.35';
    chatWindow.style.transform = 'translateY(8px)';

    if (mode === 'reduced motion') {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      vi.spyOn(window, 'matchMedia').mockReturnValue({ ...mediaQuery, matches: true });
    }
    rerender(<AIChatWindow {...props} variant={mode === 'embedded' ? 'embedded' : 'floating'} />);

    expect(animeMock.remove).toHaveBeenCalledWith(chatWindow);
    expect(animeMock).toHaveBeenCalledTimes(1);
    expect(chatWindow.style.opacity).toBe('');
    expect(chatWindow.style.transform).toBe('');
  });

  it('cancels interrupted animations and releases detached elements on unmount', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const props = { messages: [], onSendMessage: () => {} };
    const { container, rerender, unmount } = render(<AIChatWindow {...props} />);
    const chatWindow = container.firstElementChild;

    expect(animeMock).toHaveBeenCalledTimes(1);
    rerender(<AIChatWindow {...props} isClosing />);
    expect(animeMock.remove).toHaveBeenCalledTimes(1);
    expect(animeMock.remove).toHaveBeenLastCalledWith(chatWindow);
    expect(animeMock.remove.mock.invocationCallOrder[0]).toBeLessThan(animeMock.mock.invocationCallOrder[1]);

    rerender(<AIChatWindow {...props} />);
    expect(animeMock.remove).toHaveBeenCalledTimes(2);
    expect(animeMock).toHaveBeenCalledTimes(3);

    unmount();
    expect(animeMock.remove).toHaveBeenCalledTimes(3);
    expect(animeMock.remove).toHaveBeenLastCalledWith(chatWindow);
  });

  it('shows an animated generating icon while a response is in progress', () => {
    render(
      <AIChatWindow
        messages={[{ role: 'user', content: 'Hello there' }]}
        onSendMessage={() => {}}
        isGenerating
      />
    );

    expect(screen.getByText('Generating answer...')).toBeInTheDocument();
    expect(screen.getByTestId('chat-generating-icon')).toBeInTheDocument();
  });

  it('renders input accessories below the composer', () => {
    render(
      <AIChatWindow
        messages={[]}
        onSendMessage={() => {}}
        inputAccessory={<div>Attach ticket controls</div>}
      />
    );

    expect(screen.getByText('Attach ticket controls')).toBeInTheDocument();
  });
});
