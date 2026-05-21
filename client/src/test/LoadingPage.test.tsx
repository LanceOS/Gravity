import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LoadingPage } from '../pages/LoadingPage/LoadingPage.tsx';

describe('LoadingPage', () => {
  it('renders the default loading copy', () => {
    render(<LoadingPage />);

    expect(screen.getByText('Loading workspace...')).toBeInTheDocument();
    expect(screen.getByText('Fetching your projects and settings.')).toBeInTheDocument();
  });

  it('renders custom loading copy', () => {
    render(<LoadingPage title="Booting CI" subtitle="Waiting for the stack." />);

    expect(screen.getByText('Booting CI')).toBeInTheDocument();
    expect(screen.getByText('Waiting for the stack.')).toBeInTheDocument();
  });
});