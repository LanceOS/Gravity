import { act, render, screen } from '@testing-library/react';
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
  it('responds to live reduced-motion changes without a parent render and removes the listener', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const scrollIntoView = vi.spyOn(HTMLElement.prototype, 'scrollIntoView');
    const events = new EventTarget();
    const mediaQuery = {
      matches: false,
      media: '(prefers-reduced-motion: reduce)',
      addEventListener: vi.fn(events.addEventListener.bind(events)),
      removeEventListener: vi.fn(events.removeEventListener.bind(events)),
    };
    vi.spyOn(window, 'matchMedia').mockReturnValue(mediaQuery as unknown as MediaQueryList);
    const { container, unmount } = render(<AIChatWindow messages={[]} onSendMessage={() => {}} isGenerating />);
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth' });
    const chatWindow = container.firstElementChild as HTMLElement;
    chatWindow.style.opacity = '0.35';
    chatWindow.style.transform = 'translateY(8px)';

    act(() => {
      mediaQuery.matches = true;
      events.dispatchEvent(new Event('change'));
    });

    expect(animeMock.remove).toHaveBeenCalledWith(chatWindow);
    expect(chatWindow.style.opacity).toBe('');
    expect(chatWindow.style.transform).toBe('');
    expect(screen.getByTestId('chat-generating-icon').style.animation).toBe('none');
    expect(screen.getByText('Generating answer...').parentElement?.style.animation).toBe('none');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto' });

    act(() => {
      mediaQuery.matches = false;
      events.dispatchEvent(new Event('change'));
    });
    expect(screen.getByTestId('chat-generating-icon').style.animation).not.toBe('none');
    expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth' });
    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', mediaQuery.addEventListener.mock.calls[0][1]);
  });

  it('restores visible styles when switching to embedded mid-animation', () => {
    vi.stubEnv('NODE_ENV', 'development');
    const props = { messages: [], onSendMessage: () => {} };
    const { container, rerender } = render(<AIChatWindow {...props} />);
    const chatWindow = container.firstElementChild as HTMLElement;
    chatWindow.style.opacity = '0.35';
    chatWindow.style.transform = 'translateY(8px)';

    rerender(<AIChatWindow {...props} variant="embedded" />);

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
