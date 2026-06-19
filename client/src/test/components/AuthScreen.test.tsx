import type {
  ButtonHTMLAttributes,
  ChangeEvent,
  InputHTMLAttributes,
  ReactNode,
} from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuthScreen } from '../../modules/auth';

const mockUseTickets = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

type MockButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  variant?: string;
};

type MockInputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

vi.mock('../../context/TicketContextContext', () => ({
  useTickets: () => mockUseTickets,
}));

vi.mock('@library', () => ({
  Button: ({ children, leftIcon, loading, ...props }: MockButtonProps) => {
    const buttonProps = { ...props };
    delete buttonProps.variant;
    delete buttonProps.fullWidth;
    return (
      <button {...buttonProps} data-loading={loading ? 'true' : 'false'}>
        {leftIcon}
        {children}
      </button>
    );
  },
  TextInput: ({ label, value, onChange, ...props }: MockInputProps) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={onChange} {...props} />
    </label>
  ),
  PasswordInput: ({ label, value, onChange, ...props }: MockInputProps) => (
    <label>
      <span>{label}</span>
      <input value={value} onChange={onChange} {...props} />
    </label>
  ),
}));

describe('AuthScreen', () => {
  beforeEach(() => {
    mockUseTickets.signIn.mockReset();
    mockUseTickets.signUp.mockReset();
  });

  it('submits sign-in credentials and clears validation errors on success', async () => {
    const user = userEvent.setup();
    mockUseTickets.signIn.mockResolvedValue(true);

    render(<AuthScreen />);

    const signInForm = screen.getByRole('button', { name: 'Sign In' }).closest('form');
    expect(signInForm).not.toBeNull();
    fireEvent.submit(signInForm as HTMLFormElement);
    expect(screen.getByText('Please fill in all required fields.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email Address'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockUseTickets.signIn).toHaveBeenCalledWith('user@example.com', 'secret123');
    });
    expect(screen.queryByText('Please fill in all required fields.')).not.toBeInTheDocument();
  });

  it('toggles to sign-up mode, validates the full name field, and uses signUp', async () => {
    const user = userEvent.setup();
    mockUseTickets.signUp.mockResolvedValue(true);

    render(<AuthScreen />);

    await user.click(screen.getByRole('button', { name: "Don't have an account? Sign Up" }));
    expect(screen.getByLabelText('Full Name')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email Address'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    const signUpForm = screen.getByRole('button', { name: 'Create Account' }).closest('form');
    expect(signUpForm).not.toBeNull();
    fireEvent.submit(signUpForm as HTMLFormElement);
    expect(screen.getByText('Please fill in all required fields.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Full Name'), 'Jordan Lee');
    await user.click(screen.getByRole('button', { name: 'Create Account' }));

    await waitFor(() => {
      expect(mockUseTickets.signUp).toHaveBeenCalledWith('Jordan Lee', 'new@example.com', 'secret123');
    });
  });

  it('shows auth failure messages and clears them when switching modes', async () => {
    const user = userEvent.setup();
    mockUseTickets.signIn.mockResolvedValue(false);

    render(<AuthScreen />);

    await user.type(screen.getByLabelText('Email Address'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-pass');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: "Don't have an account? Sign Up" }));
    expect(screen.queryByText('Invalid email or password.')).not.toBeInTheDocument();
  });

  it('surfaces thrown authentication errors', async () => {
    const user = userEvent.setup();
    mockUseTickets.signIn.mockRejectedValue(new Error('Auth service unavailable'));

    render(<AuthScreen />);

    await user.type(screen.getByLabelText('Email Address'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Auth service unavailable')).toBeInTheDocument();
  });
});