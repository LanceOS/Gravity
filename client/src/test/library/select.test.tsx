import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
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
    const onChange = vi.fn();
    const onValueChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState('low');
      return <><form id="ticket" aria-label="Ticket" /><Select options={options} value={value} name="priority" form="ticket"
        aria-label="Priority" onClick={onClick} onKeyDown={onKeyDown} onFocus={onFocus}
        onChange={onChange} onValueChange={(nextValue) => {
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
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ target: { value: 'high' } }));
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    const form = screen.getByRole('form', { name: 'Ticket' }) as HTMLFormElement;
    expect(new FormData(form).get('priority')).toBe('high');
    expect(trigger).toHaveTextContent('High');
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
    render(<Select options={options} aria-label="Priority"
      onClick={(event) => event.preventDefault()} onKeyDown={(event) => event.preventDefault()} />);
    const trigger = screen.getByRole('button', { name: 'Priority' });
    fireEvent.click(trigger);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
