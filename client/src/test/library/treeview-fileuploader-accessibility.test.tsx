import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FileUploader, TreeView } from '@library';

describe('TreeView keyboard controls', () => {
  it('keeps expansion and selection independent for keyboard and pointer users', async () => {
    const user = userEvent.setup();
    const onNodeClick = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const folder = {
      id: 'folder',
      label: 'Projects',
      isFolder: true,
      children: [{ id: 'file', label: 'Plan.md' }],
    };
    const { container } = render(
      <form onSubmit={onSubmit}>
        <TreeView nodes={[folder]} onNodeClick={onNodeClick} />
      </form>,
    );

    const expand = screen.getByRole('button', { name: 'Expand Projects' });
    const selectFolder = screen.getByRole('button', { name: 'Projects' });
    expect(container.querySelector('button button')).toBeNull();
    expect(expand).toHaveAttribute('type', 'button');
    expect(selectFolder).toHaveAttribute('type', 'button');

    await user.tab();
    expect(expand).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Collapse Projects' })).toHaveAttribute('aria-expanded', 'true');
    expect(onNodeClick).not.toHaveBeenCalled();

    await user.tab();
    expect(selectFolder).toHaveFocus();
    await user.keyboard(' ');
    expect(onNodeClick).toHaveBeenCalledExactlyOnceWith(folder);
    expect(screen.getByRole('button', { name: 'Collapse Projects' })).toHaveAttribute('aria-expanded', 'true');

    const selectFile = screen.getByRole('button', { name: 'Plan.md' });
    await user.tab();
    expect(selectFile).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onNodeClick).toHaveBeenCalledTimes(2);
    expect(onNodeClick).toHaveBeenLastCalledWith(folder.children[0]);

    await user.click(screen.getByRole('button', { name: 'Collapse Projects' }));
    expect(onNodeClick).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button', { name: 'Plan.md' })).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('does not offer selection buttons when no selection handler exists', () => {
    render(<TreeView nodes={[{ id: 'file', label: 'Readme.md' }]} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Readme.md')).toBeInTheDocument();
  });
});

describe('FileUploader keyboard control', () => {
  it('opens the file input once per activation and handles selected and dropped files', async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    const { container } = render(
      <form onSubmit={onSubmit}>
        <FileUploader label="Attachments" onFileSelect={onFileSelect} />
      </form>,
    );

    const trigger = screen.getByRole('button', { name: /Attachments Drag and drop files here/ });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const openPicker = vi.spyOn(input, 'click').mockImplementation(() => {});
    expect(trigger).toHaveAttribute('type', 'button');
    expect(trigger).toHaveClass('lib-focus-ring');
    expect(trigger.contains(input)).toBe(false);
    expect(input).toHaveAttribute('multiple');

    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    await user.click(trigger);
    expect(openPicker).toHaveBeenCalledTimes(3);
    expect(onFileSelect).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    const file = new File(['notes'], 'notes.txt', { type: 'text/plain' });
    await user.upload(input, file);
    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(Array.from(onFileSelect.mock.calls[0][0] as FileList)).toEqual([file]);

    fireEvent.drop(trigger, { dataTransfer: { files: [file] } });
    expect(onFileSelect).toHaveBeenCalledTimes(2);
    expect(onFileSelect.mock.calls[1][0]).toEqual([file]);
  });
});
