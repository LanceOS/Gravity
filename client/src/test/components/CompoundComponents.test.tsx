import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { FormSection } from '../../components/FormSection';
import { ManagementSurface } from '../../components/ManagementSurface';
import { ModalDialog } from '../../components/ModalDialog';

describe('compound UI primitives', () => {
  it('renders a modal dialog with shared header, body, feedback, and actions', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onSubmit = vi.fn();

    render(
      <ModalDialog.Root isOpen onClose={onClose}>
        <ModalDialog.Header title="Shared Dialog" description="A reusable shell." />
        <ModalDialog.Body>
          <ModalDialog.Feedback type="info">Heads up</ModalDialog.Feedback>
          <p>Dialog content</p>
        </ModalDialog.Body>
        <ModalDialog.Footer>
          <ModalDialog.Actions>
            <button type="button" onClick={onSubmit}>Save</button>
          </ModalDialog.Actions>
        </ModalDialog.Footer>
      </ModalDialog.Root>,
    );

    expect(screen.getByRole('dialog', { name: 'Shared Dialog' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Heads up');

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders confirm dialog actions for cancellation and confirmation', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog.Root isOpen onClose={onCancel}>
        <ConfirmDialog.Header title="Delete item?" description="This cannot be undone." />
        <ConfirmDialog.Body>
          <p>Permanent action.</p>
        </ConfirmDialog.Body>
        <ConfirmDialog.Actions
          cancelLabel="Keep"
          confirmLabel="Delete"
          onCancel={onCancel}
          onConfirm={onConfirm}
        />
      </ConfirmDialog.Root>,
    );

    expect(screen.getByRole('alertdialog', { name: 'Delete item?' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders form sections with fields, color inputs, feedback, and actions', () => {
    render(
      <FormSection.Root aria-label="Example form">
        <FormSection.Header title="Details" description="Keep related fields together." />
        <FormSection.Grid>
          <FormSection.Field label="Name">
            <input />
          </FormSection.Field>
          <FormSection.ColorField label="Color" value="#3b82f6" onChange={() => {}} />
        </FormSection.Grid>
        <FormSection.Feedback type="success">Saved</FormSection.Feedback>
        <FormSection.Actions>
          <button type="submit">Submit</button>
        </FormSection.Actions>
      </FormSection.Root>,
    );

    expect(screen.getByRole('form', { name: 'Example form' })).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Color')).toHaveAttribute('type', 'color');
    expect(screen.getByRole('alert')).toHaveTextContent('Saved');
  });

  it('renders management surface list and editor sections from shared structure', () => {
    const onSelectItem = vi.fn();

    render(
      <ManagementSurface.Root>
        <ManagementSurface.ListSection
          classNamePrefix="test-management"
          sectionClassName="test-management__list-section"
          listClassName="test-management__list"
          ariaLabel="Items"
          sectionKicker="Roster"
          sectionTitle="Items"
          sectionDescription="Select an item."
          items={[{ id: 'item-1', name: 'First' }]}
          selectedItemId="item-1"
          emptyStateTitle="No items"
          emptyStateDescription="Create one."
          onSelectItem={onSelectItem}
          renderItem={({ item, isSelected, onSelect }) => (
            <button type="button" aria-pressed={isSelected} onClick={onSelect}>
              {item.name}
            </button>
          )}
        />
        <ManagementSurface.EditorSection
          classNamePrefix="test-management"
          editorClassName="test-management__editor"
          ariaLabel="Editor"
          sectionKicker="Editor"
          sectionDescription="Edit the selected item."
          selectedItem={{ id: 'item-1', name: 'First' }}
          emptyStateTitle="No selection"
          emptyStateDescription="Select one."
          getSelectedItemTitle={(item) => item.name}
        >
          {(item) => <div>{item.id}</div>}
        </ManagementSurface.EditorSection>
      </ManagementSurface.Root>,
    );

    expect(screen.getByRole('heading', { name: 'Items' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'First' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument();
    expect(screen.getByText('item-1')).toBeInTheDocument();
  });
});
