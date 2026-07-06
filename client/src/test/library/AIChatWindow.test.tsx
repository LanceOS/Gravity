import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AIChatWindow } from '@library';

describe('AIChatWindow', () => {
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
