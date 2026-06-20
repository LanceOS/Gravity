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

const mockAuthClient = vi.hoisted(() => ({
  signIn: { email: vi.fn() },
  signUp: { email: vi.fn() },
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

vi.mock('../../context/auth/authClient', () => ({
  authClient: mockAuthClient,
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
    mockAuthClient.signIn.email.mockReset();
    mockAuthClient.signUp.email.mockReset();
  });

  it('submits sign-in credentials and clears validation errors on success', async () => {
    const user = userEvent.setup();
    mockAuthClient.signIn.email.mockResolvedValue({ data: {}, error: null });

    render(<AuthScreen />);

    const signInForm = screen.getByRole('button', { name: 'Sign In' }).closest('form');
    expect(signInForm).not.toBeNull();
    fireEvent.submit(signInForm as HTMLFormElement);
    expect(screen.getByText('Please fill in all required fields.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Email Address'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    await waitFor(() => {
      expect(mockAuthClient.signIn.email).toHaveBeenCalledWith({ email: 'user@example.com', password: 'secret123' });
    });
    expect(screen.queryByText('Please fill in all required fields.')).not.toBeInTheDocument();
  });

  it('toggles to sign-up mode, validates the full name field, and uses signUp', async () => {
    const user = userEvent.setup();
    mockAuthClient.signUp.email.mockResolvedValue({ data: {}, error: null });

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
      expect(mockAuthClient.signUp.email).toHaveBeenCalledWith({ name: 'Jordan Lee', email: 'new@example.com', password: 'secret123' });
    });
  });

  it('shows auth failure messages and clears them when switching modes', async () => {
    const user = userEvent.setup();
    mockAuthClient.signIn.email.mockResolvedValue({ data: null, error: { message: 'Invalid email or password.' } });

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
    mockAuthClient.signIn.email.mockRejectedValue(new Error('Auth service unavailable'));

    render(<AuthScreen />);

    await user.type(screen.getByLabelText('Email Address'), 'user@example.com');
    await user.type(screen.getByLabelText('Password'), 'secret123');
    await user.click(screen.getByRole('button', { name: 'Sign In' }));

    expect(await screen.findByText('Auth service unavailable')).toBeInTheDocument();
  });
});