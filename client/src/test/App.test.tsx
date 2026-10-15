import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../App';

vi.mock('@library', () => ({ NotificationCenter: () => null }));
vi.mock('../context/TicketContext', () => ({
  AppContextProviders: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('../router', () => ({ router: {} }));
vi.mock('react-router-dom', () => ({ RouterProvider: () => null }));

describe('App development tools', () => {
  it('loads the query devtools only for a development render', async () => {
    expect(import.meta.env.DEV).toBe(true);

    render(<App />);

    const toggle = await screen.findByTitle('Query Cache DevTools', {}, { timeout: 4000 });
    expect(toggle).toBeInTheDocument();
    expect(screen.queryByText('Gravity Cache DevTools')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByText('Gravity Cache DevTools')).toBeInTheDocument();
  });
});
