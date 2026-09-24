import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Alert, Badge, Button } from '@library';

describe('library theme variants', () => {
  it('uses semantic theme tokens for button variants', () => {
    render(
      <div>
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="danger">Danger</Button>
      </div>,
    );

    const defaultButton = screen.getByRole('button', { name: 'Default' });
    const secondaryButton = screen.getByRole('button', { name: 'Secondary' });
    const dangerButton = screen.getByRole('button', { name: 'Danger' });

    expect(defaultButton).toHaveStyle({
      '--lib-button-bg': 'var(--surface-glass-strong)',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--border-glass)',
    });

    expect(secondaryButton).toHaveStyle({
      '--lib-button-bg': 'var(--color-state-selected-bg)',
      color: 'var(--color-primary)',
      border: '1px solid transparent',
    });

    expect(secondaryButton).toHaveStyle({ '--lib-button-hover-bg': 'var(--color-primary-light)' });

    expect(dangerButton).toHaveStyle({
      '--lib-button-bg': 'var(--color-error)',
      color: 'var(--color-text-on-danger, var(--color-text-on-accent))',
      border: '1px solid var(--color-error)',
    });
  });

  it('preserves custom mouse handlers and explicit paint across rerenders', () => {
    const onMouseEnter = vi.fn();
    const onMouseLeave = vi.fn();
    const onMouseDown = vi.fn();
    const onMouseUp = vi.fn();
    const onClick = vi.fn();
    const props = {
      onMouseEnter, onMouseLeave, onMouseDown, onMouseUp, onClick,
      style: { backgroundColor: 'rgb(12, 34, 56)', textDecoration: 'overline' },
    };
    const { rerender } = render(<Button {...props}>Custom</Button>);
    const button = screen.getByRole('button', { name: 'Custom' });

    fireEvent.mouseEnter(button);
    fireEvent.mouseDown(button);
    fireEvent.mouseUp(button);
    fireEvent.mouseLeave(button);
    for (const handler of [onMouseEnter, onMouseLeave, onMouseDown, onMouseUp]) {
      expect(handler).toHaveBeenCalledTimes(1);
    }
    expect(button).toHaveStyle(props.style);

    rerender(<Button {...props} loading>Custom</Button>);
    expect(button).toBeDisabled();
    expect(button).toHaveStyle(props.style);
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();

    rerender(<Button {...props}>Custom</Button>);
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('uses semantic theme tokens for alert and badge variants', () => {
    render(
      <div>
        <Alert type="warning" title="Heads up">
          Something needs review.
        </Alert>
        <Badge variant="success">Ready</Badge>
        <Badge variant="error">Blocked</Badge>
      </div>,
    );

    const alert = screen.getByRole('alert');
    const readyBadge = screen.getByText('Ready');
    const blockedBadge = screen.getByText('Blocked');

    expect(alert.getAttribute('style')).toContain('background-color: var(--color-bg-warning)');
    expect(alert.getAttribute('style')).toContain('border: 1px solid color-mix(in srgb, var(--color-warning) 20%, transparent)');

    expect(readyBadge.getAttribute('style')).toContain('background-color: var(--color-bg-success)');
    expect(readyBadge.getAttribute('style')).toContain('color: var(--color-text-success)');
    expect(readyBadge.getAttribute('style')).toContain('border: 1px solid transparent');

    expect(blockedBadge.getAttribute('style')).toContain('background-color: var(--color-bg-error)');
    expect(blockedBadge.getAttribute('style')).toContain('color: var(--color-text-error)');
    expect(blockedBadge.getAttribute('style')).toContain('border: 1px solid transparent');
  });
});