import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ChatInterface } from '@library';
import type { AIChatMessage } from '@library';

const mockMessages: AIChatMessage[] = [
  { role: 'user', content: 'Hello assistant!' },
  { role: 'assistant', content: 'Hello user! How can I help you today?' },
  { role: 'user', content: 'Tell me about gravity.' },
  { role: 'assistant', content: 'Gravity is a fundamental interaction.' },
];

describe('ChatInterface', () => {
  const onSendMessage = vi.fn();
  const onRegenerate = vi.fn();
  const onRetry = vi.fn();
  const mockWriteText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();

    const clipboardMock = {
      writeText: mockWriteText,
    };

    // Bulletproof clipboard mocking for JSDOM and Node global environments
    if (typeof navigator !== 'undefined') {
      if (navigator.clipboard) {
        vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(mockWriteText);
      } else {
        try {
          Object.defineProperty(navigator, 'clipboard', {
            value: clipboardMock,
            configurable: true,
            writable: true,
          });
        } catch (e) {
          // ignore
        }
      }
    }

    if (typeof window !== 'undefined' && window.navigator) {
      if (window.navigator.clipboard) {
        vi.spyOn(window.navigator.clipboard, 'writeText').mockImplementation(mockWriteText);
      } else {
        try {
          Object.defineProperty(window.navigator, 'clipboard', {
            value: clipboardMock,
            configurable: true,
            writable: true,
          });
        } catch (e) {
          // ignore
        }
      }
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders conversations with user and AI styling', () => {
    render(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
      />
    );

    // Verify messages content is rendered
    expect(screen.getByText('Hello assistant!')).toBeInTheDocument();
    expect(screen.getByText('Hello user! How can I help you today?')).toBeInTheDocument();
    expect(screen.getByText('Tell me about gravity.')).toBeInTheDocument();
    expect(screen.getByText('Gravity is a fundamental interaction.')).toBeInTheDocument();

    // Verify copy button is rendered on AI responses
    const copyButtons = screen.getAllByRole('button', { name: 'Copy message' });
    expect(copyButtons.length).toBe(2); // Two assistant messages
  });

  it('renders markdown elements (bold, italic, list, links, code blocks, tables)', () => {
    const markdownMsg: AIChatMessage[] = [
      {
        role: 'assistant',
        content: `Here is some formatted text:
**bold text**
*italic text*
_italic underscore_

* Item 1
* Item 2

[Gravity Link](https://gravity.com)

\`\`\`javascript
const x = 9.81;
\`\`\`

| Gravity | Acceleration | Direct |
| :--- | :---: | ---: |
| Earth | 9.81 m/s² | Yes |
| Moon | 1.62 m/s² | No |
`,
      },
    ];

    render(
      <ChatInterface
        sessionId="session-1"
        messages={markdownMsg}
        onSendMessage={onSendMessage}
      />
    );

    // Bold
    expect(screen.getByText('bold text').closest('strong')).toBeTruthy();

    // Italic
    expect(screen.getByText('italic text').closest('em')).toBeTruthy();
    expect(screen.getByText('italic underscore').closest('em')).toBeTruthy();

    // Lists
    expect(screen.getByText('Item 1').closest('li')).toBeTruthy();
    expect(screen.getByText('Item 2').closest('li')).toBeTruthy();

    // Link
    const link = screen.getByRole('link', { name: 'Gravity Link' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', 'https://gravity.com');

    // Code Block
    expect(screen.getByText('const x = 9.81;')).toBeInTheDocument();
    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument();

    // Table
    expect(screen.getByText('Acceleration')).toBeInTheDocument();
    expect(screen.getByText('9.81 m/s²')).toBeInTheDocument();
    expect(screen.getByText('Moon')).toBeInTheDocument();
  });

  it('updates word and character count as the user types', async () => {
    const user = userEvent.setup();
    render(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
      />
    );

    const textarea = screen.getByPlaceholderText('Ask AI a question...');
    await user.type(textarea, 'Testing gravity input');

    // 21 characters, 3 words
    expect(screen.getByTestId('char-count')).toHaveTextContent('21 characters (3 words)');
  });

  it('sends message on Enter, but inserts newline on Shift+Enter', async () => {
    const user = userEvent.setup();
    render(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
      />
    );

    const textarea = screen.getByPlaceholderText('Ask AI a question...');

    // Test Enter key
    await user.type(textarea, 'Hello World{Enter}');
    expect(onSendMessage).toHaveBeenCalledWith('Hello World');

    // Reset mocks
    vi.clearAllMocks();

    // Test Shift+Enter key using user-event hold syntax
    await user.type(textarea, 'Line 1{Shift>}{Enter}{/Shift}Line 2');

    expect(onSendMessage).not.toHaveBeenCalled();
    expect(textarea).toHaveValue('Line 1\nLine 2');
  });

  it('shows typing indicator when generating', () => {
    render(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
        isGenerating={true}
      />
    );

    expect(screen.getByText('Generating answer')).toBeInTheDocument();
    expect(screen.getByTestId('typing-dots')).toBeInTheDocument();
  });

  it('copies message to clipboard when Copy is clicked', async () => {
    const user = userEvent.setup();
    render(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
      />
    );

    const copyButtons = screen.getAllByRole('button', { name: 'Copy message' });
    await user.click(copyButtons[1]); // Copy the second assistant message

    await waitFor(() => {
      expect(mockWriteText).toHaveBeenCalledWith('Gravity is a fundamental interaction.');
    });
    expect(screen.getByText('Copied!')).toBeInTheDocument();
  });

  it('displays regenerate button only on the last AI message and calls onRegenerate', async () => {
    const user = userEvent.setup();
    render(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
        onRegenerate={onRegenerate}
      />
    );

    const regenerateButtons = screen.getAllByRole('button', { name: 'Regenerate message' });
    expect(regenerateButtons.length).toBe(1); // Only on the last assistant message

    await user.click(regenerateButtons[0]);
    expect(onRegenerate).toHaveBeenCalledTimes(1);
  });

  it('displays inline error states and triggers retry', async () => {
    const user = userEvent.setup();
    render(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
        error="Network error. Please try again."
        onRetry={onRetry}
      />
    );

    expect(screen.getByTestId('error-container')).toBeInTheDocument();
    expect(screen.getByText('Network error. Please try again.')).toBeInTheDocument();

    const retryButton = screen.getByRole('button', { name: 'Retry' });
    await user.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('preserves scroll position when switching sessions', async () => {
    const { rerender } = render(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
      />
    );

    const messageList = screen.getByTestId('message-list');
    
    // Simulate scroll and event
    Object.defineProperty(messageList, 'scrollTop', {
      writable: true,
      value: 150,
    });
    fireEvent.scroll(messageList);

    // Switch session to session-2 (position should default to bottom, i.e. scrollHeight)
    Object.defineProperty(messageList, 'scrollHeight', {
      value: 800,
    });

    rerender(
      <ChatInterface
        sessionId="session-2"
        messages={mockMessages}
        onSendMessage={onSendMessage}
      />
    );

    expect(messageList.scrollTop).toBe(800);

    // Switch back to session-1 (should restore saved position of 150)
    rerender(
      <ChatInterface
        sessionId="session-1"
        messages={mockMessages}
        onSendMessage={onSendMessage}
      />
    );

    expect(messageList.scrollTop).toBe(150);
  });
});
