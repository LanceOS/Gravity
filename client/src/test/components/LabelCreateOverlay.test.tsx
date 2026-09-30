import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LabelCreateOverlay } from '../../modules/tickets/components/LabelCreateOverlay';

describe('LabelCreateOverlay scope selection', () => {
  it.each(['team', 'project'] as const)('defaults and submits the selected %s', async (kind) => {
    const onSubmitLabel = vi.fn().mockResolvedValue(undefined);
    render(<LabelCreateOverlay isOpen onClose={vi.fn()} onSubmitLabel={onSubmitLabel} scope={{
      kind, defaultId: 'first', options: [{ value: 'first', label: 'First' }, { value: 'second', label: 'Second' }],
    }} />);
    const selector = screen.getByRole('button', { name: kind === 'team' ? 'Team' : 'Project' });
    expect(selector).toHaveTextContent('First');
    fireEvent.click(selector);
    fireEvent.click(screen.getByRole('option', { name: 'Second' }));
    fireEvent.change(screen.getByLabelText('Label Name'), { target: { value: ' New label ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Label' }));
    await waitFor(() => expect(onSubmitLabel).toHaveBeenCalledWith({
      name: 'New label', color: '#3b82f6', description: '', [kind === 'team' ? 'teamId' : 'projectId']: 'second',
    }));
  });

  it('requires an available scope and retains the dialog when no choices exist', async () => {
    const onSubmitLabel = vi.fn();
    const onClose = vi.fn();
    render(<LabelCreateOverlay isOpen onClose={onClose} onSubmitLabel={onSubmitLabel}
      scope={{ kind: 'team', defaultId: 'stale-team', options: [] }} />);
    fireEvent.change(screen.getByLabelText('Label Name'), { target: { value: 'Bug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Label' }));
    expect(await screen.findByText('Please select a team.')).toBeInTheDocument();
    expect(onSubmitLabel).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('keeps the selected scope and draft on failure, and resets on reopening', async () => {
    const onSubmitLabel = vi.fn().mockRejectedValue(new Error('Duplicate'));
    const onClose = vi.fn();
    const props = { onSubmitLabel, onClose, scope: { kind: 'project' as const, defaultId: 'first', options: [
      { value: 'first', label: 'First' }, { value: 'second', label: 'Second' },
    ] } };
    const { rerender } = render(<LabelCreateOverlay {...props} isOpen />);
    fireEvent.click(screen.getByRole('button', { name: 'Project' }));
    fireEvent.click(screen.getByRole('option', { name: 'Second' }));
    fireEvent.change(screen.getByLabelText('Label Name'), { target: { value: 'Bug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Label' }));
    await waitFor(() => expect(onSubmitLabel).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Project' })).toHaveTextContent('Second');
    expect(screen.getByLabelText('Label Name')).toHaveValue('Bug');
    rerender(<LabelCreateOverlay {...props} isOpen={false} />);
    rerender(<LabelCreateOverlay {...props} isOpen />);
    expect(screen.getByRole('button', { name: 'Project' })).toHaveTextContent('First');
    expect(screen.getByLabelText('Label Name')).toHaveValue('');
  });

  it('preserves unscoped caller payloads for existing entry points', async () => {
    const onSubmitLabel = vi.fn().mockResolvedValue(undefined);
    render(<LabelCreateOverlay isOpen onClose={vi.fn()} onSubmitLabel={onSubmitLabel} />);
    expect(screen.queryByRole('button', { name: /^(Project|Team)$/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Label Name'), { target: { value: 'Bug' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Label' }));
    await waitFor(() => expect(onSubmitLabel).toHaveBeenCalledWith({ name: 'Bug', color: '#3b82f6', description: '' }));
  });
  it('preserves the draft and chosen scope when the active context refreshes', () => {
    const props = { onClose: vi.fn(), onSubmitLabel: vi.fn(), scope: {
      kind: 'project' as const, defaultId: 'first', options: [
        { value: 'first', label: 'First' }, { value: 'second', label: 'Second' },
      ],
    } };
    const { rerender } = render(<LabelCreateOverlay {...props} isOpen />);
    fireEvent.change(screen.getByLabelText('Label Name'), { target: { value: 'Draft' } });
    rerender(<LabelCreateOverlay {...props} scope={{ ...props.scope, defaultId: 'second' }} isOpen />);
    expect(screen.getByLabelText('Label Name')).toHaveValue('Draft');
    expect(screen.getByRole('button', { name: 'Project' })).toHaveTextContent('First');
  });

  it('does not submit a canceled draft using a global shortcut while closed', () => {
    const props = { onClose: vi.fn(), onSubmitLabel: vi.fn(), scope: {
      kind: 'team' as const, defaultId: 'first', options: [{ value: 'first', label: 'First' }],
    } };
    const { rerender } = render(<LabelCreateOverlay {...props} isOpen />);
    fireEvent.change(screen.getByLabelText('Label Name'), { target: { value: 'Canceled' } });
    rerender(<LabelCreateOverlay {...props} isOpen={false} />);
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(props.onSubmitLabel).not.toHaveBeenCalled();
  });

  it('adopts a late-loading default without clearing entered text', () => {
    const props = { onClose: vi.fn(), onSubmitLabel: vi.fn(), scope: {
      kind: 'team' as const, defaultId: '', options: [] as { value: string; label: string }[],
    } };
    const { rerender } = render(<LabelCreateOverlay {...props} isOpen />);
    fireEvent.change(screen.getByLabelText('Label Name'), { target: { value: 'Draft' } });
    rerender(<LabelCreateOverlay {...props} isOpen scope={{
      ...props.scope, defaultId: 'team-1', options: [{ value: 'team-1', label: 'Team one' }],
    }} />);
    expect(screen.getByLabelText('Label Name')).toHaveValue('Draft');
    expect(screen.getByRole('button', { name: 'Team' })).toHaveTextContent('Team one');
  });

});
