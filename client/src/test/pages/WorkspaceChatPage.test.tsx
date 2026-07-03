import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceChatPage } from '../../modules/aiChat';

const mocks = vi.hoisted(() => ({
  WorkspaceChatDock: vi.fn(() => <div data-testid="workspace-chat-dock" />),
}));

vi.mock('../../modules/aiChat/components/WorkspaceChatDock', () => ({
  WorkspaceChatDock: mocks.WorkspaceChatDock,
}));

describe('WorkspaceChatPage', () => {
  beforeEach(() => {
    mocks.WorkspaceChatDock.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('renders the chat dock without a page header', () => {
    render(
      <WorkspaceChatPage
        workspaceId="workspace-1"
        projectId="project-1"
        initialOllamaUrl="http://localhost:11434"
        initialModel="claude-3-haiku"
        settings={{
          defaultView: 'board',
          theme: 'dark',
          ollamaModel: '',
          ollamaEndpoint: 'http://localhost:11434',
          projectLayout: 'standard',
          apiKey: '',
          aiProvider: 'anthropic',
          agentIntegration: 'third_party',
        }}
      />
    );

    expect(screen.getByTestId('workspace-chat-dock')).toBeInTheDocument();
    expect(screen.queryByText('AI Chat')).not.toBeInTheDocument();
  });
});
