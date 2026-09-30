import { act, fireEvent, render, waitFor } from '@testing-library/react';
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

describe('MarkdownEditor asynchronous saves', () => {
  it('serializes saves and submits only the latest value blurred while pending', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { resolveSave = resolve; })).mockResolvedValue(undefined);
    const { getByRole } = render(<MarkdownEditor value="Original" onSave={onSave} singleLine />);
    const input = getByRole('textbox');
    for (const value of ['First edit', 'Second edit', 'Latest edit']) {
      fireEvent.change(input, { target: { value } });
      fireEvent.blur(input);
    }
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => resolveSave());
    expect(onSave.mock.calls).toEqual([['First edit'], ['Latest edit']]);
  });

  it.each(['reject', 'false'])('retains the latest draft after a %s failure and retries on blur', async failure => {
    let finish!: () => void;
    const onSave = vi.fn().mockImplementationOnce(() => new Promise<boolean>((resolve, reject) => {
      finish = () => failure === 'reject' ? reject(new Error('Offline')) : resolve(false);
    })).mockResolvedValue(true);
    const { getByRole } = render(<MarkdownEditor value="Original" onSave={onSave} singleLine />);
    const input = getByRole('textbox');
    fireEvent.change(input, { target: { value: 'First edit' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: 'Latest edit' } });
    fireEvent.blur(input);
    await act(async () => finish());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue('Latest edit');
    fireEvent.blur(input);
    await waitFor(() => expect(onSave).toHaveBeenLastCalledWith('Latest edit'));
  });

  it('saves a queued revert to the original value after the first save succeeds', async () => {
    let resolveSave!: () => void;
    const onSave = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { resolveSave = resolve; })).mockResolvedValue(undefined);
    const { getByRole } = render(<MarkdownEditor value="Original" onSave={onSave} singleLine />);
    const input = getByRole('textbox');
    fireEvent.change(input, { target: { value: 'First edit' } });
    fireEvent.blur(input);
    fireEvent.change(input, { target: { value: 'Original' } });
    fireEvent.blur(input);
    await act(async () => resolveSave());
    expect(onSave.mock.calls).toEqual([['First edit'], ['Original']]);
  });
});
