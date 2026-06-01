import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkspaceViewContainer } from '../../components/WorkspaceViewContainer';

describe('WorkspaceViewContainer', () => {
  it('renders its children correctly', () => {
    render(
      <WorkspaceViewContainer>
        <div data-testid="child">Test Child</div>
      </WorkspaceViewContainer>
    );

    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(screen.getByText('Test Child')).toBeInTheDocument();
  });

  it('applies the correct css class', () => {
    const { container } = render(
      <WorkspaceViewContainer>
        <div>Content</div>
      </WorkspaceViewContainer>
    );

    expect(container.firstChild).toHaveClass('workspace-view-container');
  });
});
