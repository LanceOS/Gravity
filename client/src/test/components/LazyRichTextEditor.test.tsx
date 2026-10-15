import { createRef } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createEmptyRichTextValue } from '@library';
import type { RichTextEditorHandle } from '@library/components/richtext/RichTextEditor';
import { LazyRichTextEditor } from '../../components/LazyRichTextEditor';

describe('LazyRichTextEditor', () => {
  it('loads the editor and preserves its imperative image insertion handle', async () => {
    const ref = createRef<RichTextEditorHandle>();
    const onChange = vi.fn();
    const { container } = render(
      <LazyRichTextEditor ref={ref} value={createEmptyRichTextValue()} onChange={onChange} toolbarMode="none" />,
    );

    expect(screen.getByRole('status', { name: 'Loading editor' })).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('.rich-text-editor__editor')).not.toBeNull());
    await waitFor(() => expect(ref.current).not.toBeNull());
    act(() => ref.current?.insertImage({ src: '/note-image.png', alt: 'Note image' }));

    expect(container.querySelector('.rich-text-editor__editor img')?.getAttribute('src')).toBe('/note-image.png');
    expect(onChange).toHaveBeenCalled();
  });
});
