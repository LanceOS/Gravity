import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { ActiveViewProvider, useActiveView } from '../ActiveViewContext';
import { describe, it, expect, vi } from 'vitest';

beforeEach(() => {
  window.localStorage.clear();
});

describe('ActiveViewContext', () => {
  it('should default to board view', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveViewProvider>{children}</ActiveViewProvider>
    );

    const { result } = renderHook(() => useActiveView(), { wrapper });

    expect(result.current.activeView).toBe('board');
  });

  it('should initialize from localStorage saved board/list preference', () => {
    window.localStorage.setItem('gravity_active_view', 'list');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveViewProvider>{children}</ActiveViewProvider>
    );

    const { result } = renderHook(() => useActiveView(), { wrapper });

    expect(result.current.activeView).toBe('list');
  });

  it('should fall back to board when localStorage preference is invalid', () => {
    window.localStorage.setItem('gravity_active_view', 'kanban');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveViewProvider>{children}</ActiveViewProvider>
    );

    const { result } = renderHook(() => useActiveView(), { wrapper });

    expect(result.current.activeView).toBe('board');
  });

  it('should toggle view correctly', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <ActiveViewProvider>{children}</ActiveViewProvider>
    );

    const { result } = renderHook(() => useActiveView(), { wrapper });

    act(() => {
      result.current.setView('list');
    });

    expect(result.current.activeView).toBe('list');

    act(() => {
      result.current.setView('board');
    });

    expect(result.current.activeView).toBe('board');
  });

  it('should throw error when used outside provider', () => {
    // Suppress console.error for the expected error
    const consoleError = console.error;
    console.error = vi.fn();

    expect(() => {
      renderHook(() => useActiveView());
    }).toThrow('useActiveView must be used within an ActiveViewProvider');

    console.error = consoleError;
  });
});
