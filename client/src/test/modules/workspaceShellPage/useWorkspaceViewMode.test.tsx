import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceViewMode } from '../../../modules/workspaceShellPage/hooks/useWorkspaceViewMode';

let originalInnerWidth: number | null = null;

function ViewModeHarness() {
  const [activeView, setActiveView] = useState<'board' | 'list'>('list');
  const { isMobile } = useWorkspaceViewMode(activeView, setActiveView);

  return (
    <div>
      <div data-testid="view">{activeView}</div>
      <div data-testid="mobile">{isMobile ? 'mobile' : 'desktop'}</div>
      <button type="button" onClick={() => setActiveView('board')}>
        Switch to board
      </button>
      <button type="button" onClick={() => setActiveView('list')}>
        Switch to list
      </button>
    </div>
  );
}

describe('useWorkspaceViewMode', () => {
  afterEach(() => {
    if (originalInnerWidth !== null) {
      window.innerWidth = originalInnerWidth;
      window.dispatchEvent(new Event('resize'));
      originalInnerWidth = null;
    }
    vi.unstubAllGlobals();
  });

  it('does not force the user back to list after they select board on mobile', async () => {
    originalInnerWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      writable: true,
      value: 500,
    });

    render(<ViewModeHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('mobile')).toHaveTextContent('mobile');
      expect(screen.getByTestId('view')).toHaveTextContent('list');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Switch to board' }));

    expect(screen.getByTestId('view')).toHaveTextContent('board');
  });
});
