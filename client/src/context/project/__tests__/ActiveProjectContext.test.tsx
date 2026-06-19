import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveProjectProvider, useActiveProject } from '../ActiveProjectContext';

const TestComponent = () => {
  const { activeProjectId, setActiveProjectId, activeProjectIdRef } = useActiveProject();

  return (
    <div>
      <div data-testid="state">{activeProjectId}</div>
      <div data-testid="ref">{activeProjectIdRef.current}</div>
      <button onClick={() => setActiveProjectId('proj-123')}>Set Proj 1</button>
      <button onClick={() => setActiveProjectId('proj-456')}>Set Proj 2</button>
    </div>
  );
};

describe('ActiveProjectContext', () => {
  it('provides activeProjectId state and ref', () => {
    render(
      <ActiveProjectProvider>
        <TestComponent />
      </ActiveProjectProvider>
    );

    expect(screen.getByTestId('state').textContent).toBe('');
    expect(screen.getByTestId('ref').textContent).toBe('');
  });

  it('updates state and ref when setActiveProjectId is called', () => {
    render(
      <ActiveProjectProvider>
        <TestComponent />
      </ActiveProjectProvider>
    );

    fireEvent.click(screen.getByText('Set Proj 1'));

    expect(screen.getByTestId('state').textContent).toBe('proj-123');
    // useEffect should have fired synchronously in the test environment due to act()
    expect(screen.getByTestId('ref').textContent).toBe('proj-123');
  });

  it('preserves no-op short-circuit behavior for same project selection', () => {
    let renderCount = 0;
    const RenderCounter = () => {
      const { setActiveProjectId } = useActiveProject();
      renderCount++;
      return <button onClick={() => setActiveProjectId('proj-123')}>Set Proj</button>;
    };

    render(
      <ActiveProjectProvider>
        <RenderCounter />
      </ActiveProjectProvider>
    );

    renderCount = 0; // reset after initial render
    fireEvent.click(screen.getByText('Set Proj')); // state changes from '' to 'proj-123'
    expect(renderCount).toBeGreaterThan(0);
    
    renderCount = 0;
    fireEvent.click(screen.getByText('Set Proj')); // should be a no-op short-circuit
    expect(renderCount).toBe(0);
  });
});
