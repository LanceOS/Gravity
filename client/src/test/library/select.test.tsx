import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { Select } from '@library';

const options = [{ value: 'low', label: 'Low' }, { value: 'high', label: 'High' }];

describe('Select trigger props', () => {
  it('forwards supported attributes without leaking native select props or overriding trigger behavior', () => {
    const nativeProps = { multiple: true, required: true, size: 4, defaultValue: 'high', autoComplete: 'off' };
    render(
      <Select {...nativeProps} options={options} value="low" name="priority"
        aria-label="Priority" aria-describedby="help" aria-expanded="true" aria-haspopup="dialog"
        data-testid="priority" title="Choose priority" tabIndex={2} />,
    );
    const trigger = screen.getByRole('button', { name: 'Priority' });
    expect(trigger).toBe(screen.getByTestId('priority'));
    expect(trigger).toHaveAttribute('aria-describedby', 'help');
    expect(trigger).toHaveAttribute('title', 'Choose priority');
    expect(trigger).toHaveAttribute('tabindex', '2');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    for (const attribute of ['multiple', 'required', 'size', 'defaultValue', 'autocomplete', 'name', 'value']) {
      expect(trigger).not.toHaveAttribute(attribute);
    }
    fireEvent.click(trigger);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
  });

  it('composes button handlers with selection and preserves form values', () => {
    const onClick = vi.fn();
    const onKeyDown = vi.fn();
    const onFocus = vi.fn();
    const onValueChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState('low');
      return <><form id="ticket" aria-label="Ticket" /><Select options={options} value={value} name="priority" form="ticket"
        aria-label="Priority" onClick={onClick} onKeyDown={onKeyDown} onFocus={onFocus}
        onValueChange={(nextValue) => {
          setValue(nextValue);
          onValueChange(nextValue);
        }} /></>;
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Priority' });
    fireEvent.focus(trigger);
    expect(onFocus).toHaveBeenCalledTimes(1);
    fireEvent.click(trigger);
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'Enter' });
    expect(onKeyDown).toHaveBeenCalledTimes(2);
    expect(onValueChange).toHaveBeenCalledWith('high');
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Ticket' }) as HTMLFormElement;
    expect(new FormData(form).get('priority')).toBe('high');
    expect(trigger).toHaveTextContent('High');
  });

  it('reports pointer selections and placeholder values without emitting change events', () => {
    const onValueChange = vi.fn();
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState('low');
      return <form aria-label="Ticket" onChange={onChange}>
        <Select options={[...options, { value: 'disabled', label: 'Disabled', disabled: true }]}
          value={value} name="priority" label="Priority" placeholder="Choose priority"
          onValueChange={(nextValue) => { setValue(nextValue); onValueChange(nextValue); }} />
      </form>;
    }
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Priority' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Disabled' }));
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: 'High' }));
    expect(onValueChange.mock.calls).toEqual([['high']]);
    expect(trigger).toHaveTextContent('High');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'Choose priority' }));
    expect(onValueChange.mock.calls).toEqual([['high'], ['']]);
    expect(trigger).toHaveTextContent('Choose priority');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(new FormData(screen.getByRole('form', { name: 'Ticket' }) as HTMLFormElement).get('priority')).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps disabled fields out of form submission and blocks selection', () => {
    const onValueChange = vi.fn();
    render(<form aria-label="Ticket"><Select options={options} value="low" name="priority"
      label="Priority" disabled onValueChange={onValueChange} /></form>);
    const trigger = screen.getByRole('button', { name: 'Priority' });
    expect(trigger).toBeDisabled();
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onValueChange).not.toHaveBeenCalled();
    const form = screen.getByRole('form', { name: 'Ticket' }) as HTMLFormElement;
    expect(new FormData(form).has('priority')).toBe(false);
  });

  it.each(['{Enter}', ' '])('selects once with %s after skipping disabled options', async (activationKey) => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    const onSubmit = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={onSubmit}><Select label="Priority" value="low"
      options={[options[0], { value: 'disabled', label: 'Disabled', disabled: true }, options[1]]}
      onValueChange={onValueChange} /></form>);
    const trigger = screen.getByRole('button', { name: 'Priority' });
    trigger.focus();
    await user.keyboard(activationKey);
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{ArrowDown}');
    await user.keyboard(activationKey);
    expect(onValueChange.mock.calls).toEqual([['high']]);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('only changes the displayed and submitted value when the parent updates value', () => {
    const onValueChange = vi.fn();
    const view = (value?: string) => <form aria-label="Ticket"><Select options={options}
      label="Priority" placeholder="Choose priority" name="priority" value={value}
      onValueChange={onValueChange} /></form>;
    const { rerender } = render(view());
    const trigger = screen.getByRole('button', { name: 'Priority' });
    const form = screen.getByRole('form', { name: 'Ticket' }) as HTMLFormElement;
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'High' }));
    expect(onValueChange.mock.calls).toEqual([['high']]);
    expect(trigger).toHaveTextContent('Choose priority');
    expect(new FormData(form).get('priority')).toBe('');
    rerender(view('high'));
    expect(trigger).toHaveTextContent('High');
    expect(new FormData(form).get('priority')).toBe('high');
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('option', { name: 'High' }));
    expect(onValueChange.mock.calls).toEqual([['high'], ['high']]);
  });

  it.each(['Escape', 'Tab'])('dismisses with %s without committing a value', (key) => {
    const onValueChange = vi.fn();
    render(<Select options={options} label="Priority" value="low" onValueChange={onValueChange} />);
    const trigger = screen.getByRole('button', { name: 'Priority' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.keyDown(trigger, { key });
    expect(onValueChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('preserves external labels and connects errors despite conflicting caller metadata', () => {
    render(<><span id="priority-label">Ticket priority</span><Select options={options} value="low"
      label="Priority" aria-labelledby="priority-label" error="Choose another priority"
      aria-invalid="false" aria-errormessage="stale-error" aria-controls="stale-menu" data-open="true" /></>);
    const trigger = screen.getByRole('button', { name: 'Ticket priority' });
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-errormessage', screen.getByRole('alert').id);
    expect(trigger).not.toHaveAttribute('aria-controls');
    expect(trigger).not.toHaveAttribute('data-open');
    fireEvent.click(trigger);
    const menu = screen.getByRole('listbox', { name: 'Ticket priority' });
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger).toHaveAttribute('data-open', 'true');
  });

  it('allows button handlers to cancel default interactions', () => {
    const onParentClick = vi.fn();
    const onParentKeyDown = vi.fn();
    const onClick = vi.fn((event: React.MouseEvent<HTMLButtonElement>) => {
      expect(event.nativeEvent).toBeInstanceOf(MouseEvent);
      expect(event.currentTarget).toBe(screen.getByRole('button', { name: 'Priority' }));
      event.preventDefault();
      event.stopPropagation();
    });
    const onKeyDown = vi.fn((event: React.KeyboardEvent<HTMLButtonElement>) => {
      expect(event.nativeEvent).toBeInstanceOf(KeyboardEvent);
      event.preventDefault();
      event.stopPropagation();
    });
    render(<div onClick={onParentClick} onKeyDown={onParentKeyDown}>
      <Select options={options} aria-label="Priority" onClick={onClick} onKeyDown={onKeyDown} />
    </div>);
    const trigger = screen.getByRole('button', { name: 'Priority' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onKeyDown).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
    expect(onParentKeyDown).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
