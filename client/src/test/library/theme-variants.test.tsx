import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
      backgroundColor: 'var(--color-surface-card)',
      color: 'var(--color-text-secondary)',
      border: '1px solid var(--color-border-default)',
    });

    expect(secondaryButton).toHaveStyle({
      backgroundColor: 'var(--color-state-selected-bg)',
      color: 'var(--color-primary)',
      border: '1px solid var(--color-border-focus)',
    });

    fireEvent.mouseEnter(secondaryButton);
    expect(secondaryButton).toHaveStyle({ backgroundColor: 'var(--color-primary-light)' });

    expect(dangerButton).toHaveStyle({
      backgroundColor: 'var(--color-error)',
      color: 'var(--color-text-on-accent)',
      border: '1px solid var(--color-error)',
    });
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
    expect(alert.getAttribute('style')).toContain('border: 1px solid var(--color-warning)');

    expect(readyBadge.getAttribute('style')).toContain('background-color: var(--color-bg-success)');
    expect(readyBadge.getAttribute('style')).toContain('color: var(--color-text-success)');
    expect(readyBadge.getAttribute('style')).toContain('border-color: var(--color-success)');

    expect(blockedBadge.getAttribute('style')).toContain('background-color: var(--color-bg-error)');
    expect(blockedBadge.getAttribute('style')).toContain('color: var(--color-text-error)');
    expect(blockedBadge.getAttribute('style')).toContain('border-color: var(--color-border-error)');
  });
});