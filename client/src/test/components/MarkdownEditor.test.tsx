import { fireEvent, render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarkdownEditor } from '@library';

describe('MarkdownEditor', () => {
  it('keeps single-line mode plain text and saves on Enter without formatting controls', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const { container, queryByTitle } = render(
      <MarkdownEditor
        value=""
        onSave={onSave}
        singleLine={true}
        minHeight="auto"
        placeholder="Untitled"
      />,
    );

    const editor = container.querySelector('input[type="text"]');

    expect(editor).not.toBeNull();
    expect(queryByTitle('Bold')).not.toBeInTheDocument();

    await user.click(editor!);
    await user.type(editor!, 'Updated ticket title{enter}');

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Updated ticket title');
    });
  });

  it('flattens pasted line breaks in single-line mode', async () => {
    const onSave = vi.fn();
    const { container } = render(
      <MarkdownEditor
        value=""
        onSave={onSave}
        singleLine={true}
        minHeight="auto"
      />,
    );

    const editor = container.querySelector('input[type="text"]');

    expect(editor).not.toBeNull();

    fireEvent.focus(editor!);
    fireEvent.paste(editor!, {
      clipboardData: {
        getData: (type: string) => (type === 'text/plain' ? 'Line one\nLine two' : ''),
      },
    });
    fireEvent.blur(editor!);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('Line one Line two');
    });
  });
});