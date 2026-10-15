import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
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

    expect(await screen.findByTitle('Query Cache DevTools')).toBeInTheDocument();
  });
});
