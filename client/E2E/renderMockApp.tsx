import React from 'react';
import { act, render } from '@testing-library/react';
import { expect, vi } from 'vitest';
import App from '../src/App';
import { authClient } from '../src/context/auth/authClient';
import { dbState } from './setup';

export async function renderMockApp() {
  // Better Auth caches its session independently of React Query. Fetch the
  // current test's seeded identity through the mock HTTP transport before mount.
  await act(async () => {
    await authClient.$store.atoms.session.get().refetch();
    const session = authClient.$store.atoms.session.get();
    expect(session.error).toBeNull();
    expect(session.data?.user.id ?? null).toBe(dbState.currentUser?.id ?? null);
    render(<App />);
  });

  // Exercise the router's actual lazy imports, then wait for their completion.
  // Cold Vite transforms must not race a user-facing findBy/waitFor deadline.
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}
