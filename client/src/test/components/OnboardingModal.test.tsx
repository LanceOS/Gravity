import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingModal } from '../../modules/onboarding';

const mocks = vi.hoisted(() => ({
  useCurrentUser: vi.fn(),
  fetch: vi.fn(),
}));

type MockButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  variant?: string;
};

type MockModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children?: ReactNode;
};

type MockLayoutProps = HTMLAttributes<HTMLDivElement> & {
  children?: ReactNode;
  gap?: string;
  align?: string;
  justify?: string;
};

vi.mock('../../context/auth/useCurrentUser', () => ({
  useCurrentUser: mocks.useCurrentUser,
}));

vi.mock('../../context/label/LabelContext', () => ({
  useLabels: () => ({ labels: [], globalLabels: [], labelsByProject: new Map(), assignLabelToTicket: vi.fn(), unassignLabelFromTicket: vi.fn(), createLabel: vi.fn(), updateLabel: vi.fn(), deleteLabel: vi.fn() }),
}));
vi.mock('../../context/cycle/CycleContext', () => ({
  useCycles: () => ({ cycles: [] }),
}));

vi.mock('@library', () => ({
  Button: ({ children, leftIcon, rightIcon, ...props }: MockButtonProps) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.fullWidth;
    return (
      <button {...buttonProps}>
        {leftIcon}
        {children}
        {rightIcon}
      </button>
    );
  },
  Modal: ({ isOpen, onClose, title, children }: MockModalProps) =>
    isOpen ? (
      <div>
        <div>{title}</div>
        <button type="button" onClick={onClose}>
          Close modal
        </button>
        {children}
      </div>
    ) : null,
  Stack: ({ children, ...props }: MockLayoutProps) => <div {...props}>{children}</div>,
  Flex: ({ children, ...props }: MockLayoutProps) => <div {...props}>{children}</div>,
}));

describe('OnboardingModal', () => {
  beforeEach(() => {
    mocks.useCurrentUser.mockReset();
    mocks.fetch.mockReset();
    mocks.useCurrentUser.mockReturnValue({
      currentUser: {
        id: 'user-1',
        name: 'Casey Carter',
      },
      loading: false,
    });
    vi.stubGlobal('fetch', mocks.fetch);
  });

  it('walks through the tour, supports back navigation, and completes on finish', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    mocks.fetch.mockResolvedValue({ ok: true });

    render(<OnboardingModal onComplete={onComplete} />);

    expect(screen.getByText('Welcome to Gravity, Casey Carter!')).toBeInTheDocument();
    expect(screen.getByText('Welcome to Gravity')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /let's do it!/i }));
    expect(screen.getByText('Workspace Tour - Step 1')).toBeInTheDocument();
    expect(screen.getByText('Multi-Tenant Project Databases')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText('Welcome to Gravity, Casey Carter!')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /let's do it!/i }));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('Cycles & Labels')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('AI Assistant')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('MCP Agent Integrations')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Finish Tour' }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith('/api/v1/users/user-1/tutorial', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: true }),
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
    });
  });

  it('falls back to completion when the skip request throws', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.fetch.mockRejectedValue(new Error('network down'));

    render(<OnboardingModal onComplete={onComplete} />);

    await user.click(screen.getByRole('button', { name: /no thanks, skip it/i }));

    await waitFor(() => {
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    consoleErrorSpy.mockRestore();
  });
});
