import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ThemeProvider, useTheme } from '../ThemeContext';
import { THEME_STORAGE_KEY } from '../../../constants/storage';

let renderCount = 0;

const ThemeProbe = React.memo(function ThemeProbe() {
  // eslint-disable-next-line react-hooks/globals -- Test probe exposes the rendered context to assertions outside React.
  renderCount += 1;
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <button type="button" onClick={() => setTheme('midnight-azure')}>
        Set Midnight Azure
      </button>
    </div>
  );
});

function ThemeHarness() {
  const [tick, setTick] = useState(0);

  return (
    <ThemeProvider>
      <button type="button" onClick={() => setTick((current) => current + 1)}>
        Force rerender {tick}
      </button>
      <ThemeProbe />
    </ThemeProvider>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    renderCount = 0;
    window.localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.style.cssText = '';
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.className = '';
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-density');
    document.documentElement.style.cssText = '';
  });

  it('hydrates from storage and persists theme changes', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'coffee');

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme')).toHaveTextContent('coffee');
    expect(document.documentElement).toHaveAttribute('data-theme', 'coffee');
    expect(renderCount).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Set Midnight Azure' }));

    expect(screen.getByTestId('theme')).toHaveTextContent('midnight-azure');
    expect(document.documentElement).toHaveAttribute('data-theme', 'midnight-azure');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight-azure');
    expect(renderCount).toBe(2);
  });

  it('keeps memoized consumers stable across unrelated parent rerenders', () => {
    render(<ThemeHarness />);

    expect(screen.getByTestId('theme')).toHaveTextContent('marble-blue');
    expect(renderCount).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Force rerender 0' }));

    expect(renderCount).toBe(1);
    expect(screen.getByTestId('theme')).toHaveTextContent('marble-blue');

    fireEvent.click(screen.getByRole('button', { name: 'Set Midnight Azure' }));

    expect(screen.getByTestId('theme')).toHaveTextContent('midnight-azure');
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('midnight-azure');
    expect(renderCount).toBe(2);
  });
});
