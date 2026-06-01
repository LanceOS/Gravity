import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import App from '../src/App';
import { dbState } from './setup';

console.log('E2E test module loaded: domain-filter-navigation');

describe('Domain filter navigation E2E', () => {
  it.only('navigates to domain-filtered view when clicking a domain from ticket detail', async () => {
    const user = userEvent.setup();

    // Prepare mock DB state
    dbState.currentUser = { id: 'usr-1', name: 'E2E User', email: 'e2e@gravity.test', tutorial_completed: 1 } as any;
    dbState.accountSettings = { userId: dbState.currentUser.id, theme: 'dark', projectLayout: 'standard', notificationsEnabled: true } as any;
    dbState.workspaces = [{ id: 'wsp-1', name: 'E2E Workspace', defaultProjectId: 'prj-1', role: 'owner' }];
    dbState.projects = [{ id: 'prj-1', workspaceId: 'wsp-1', name: 'E2E Project', key: 'TST' }];
    dbState.domains = [
      { id: 'dom-frontend', projectId: 'prj-1', name: 'Frontend', slug: 'frontend' },
      { id: 'dom-backend', projectId: 'prj-1', name: 'Backend', slug: 'backend' },
    ];

    const now = new Date().toISOString();
    dbState.tickets = [
      {
        id: 't1',
        key: 'TST-1',
        title: 'Frontend bug',
        description: '',
        status: 'todo',
        priority: 'medium',
        projectId: 'prj-1',
        domainId: 'dom-frontend',
        cycleId: null,
        assigneeId: null,
        parentId: null,
        createdAt: now,
        prStatus: 'none',
        prUrl: null,
      },
      {
        id: 't2',
        key: 'TST-2',
        title: 'Backend task',
        description: '',
        status: 'todo',
        priority: 'medium',
        projectId: 'prj-1',
        domainId: 'dom-backend',
        cycleId: null,
        assigneeId: null,
        parentId: null,
        createdAt: now,
        prStatus: 'none',
        prUrl: null,
      },
    ];

    window.localStorage.setItem('gravity_theme', 'dark');

    render(<App />);

    // Wait for ticket to appear in the board/list
    const ticketCard = await screen.findByText('Frontend bug');
    expect(ticketCard).toBeInTheDocument();

    // Open ticket detail
    await user.click(ticketCard);

    // Ensure detail opened by checking ticket key
    const ticketKey = await screen.findByText('TST-1');
    expect(ticketKey).toBeInTheDocument();

    // Click the domain in the sidebar
    const domainButton = await screen.findByRole('button', { name: 'Frontend' });
    await user.click(domainButton);

    // Detail should close
    await waitFor(() => {
      expect(screen.queryByText('TST-1')).not.toBeInTheDocument();
    });

    // Header should show domain title
    const headerTitle = await screen.findByText('Frontend Domain', { selector: '.workspace-header__title' });
    expect(headerTitle).toBeInTheDocument();

    // Only frontend tickets should be visible
    expect(screen.getByText('Frontend bug')).toBeInTheDocument();
    expect(screen.queryByText('Backend task')).not.toBeInTheDocument();
  });

  it('back button closes ticket detail and preserves header', async () => {
    const user = userEvent.setup();

    // Prepare mock DB state
    dbState.currentUser = { id: 'usr-2', name: 'E2E User 2', email: 'e2e2@gravity.test', tutorial_completed: 1 } as any;
    dbState.accountSettings = { userId: dbState.currentUser.id, theme: 'dark', projectLayout: 'standard', notificationsEnabled: true } as any;
    dbState.workspaces = [{ id: 'wsp-2', name: 'E2E Workspace 2', defaultProjectId: 'prj-2', role: 'owner' }];
    dbState.projects = [{ id: 'prj-2', workspaceId: 'wsp-2', name: 'E2E Project 2', key: 'TST' }];
    dbState.domains = [{ id: 'dom-frontend', projectId: 'prj-2', name: 'Frontend', slug: 'frontend' }];

    const now = new Date().toISOString();
    dbState.tickets = [
      {
        id: 't10',
        key: 'TST-10',
        title: 'Open detail ticket',
        description: '',
        status: 'todo',
        priority: 'medium',
        projectId: 'prj-2',
        domainId: 'dom-frontend',
        cycleId: null,
        assigneeId: null,
        parentId: null,
        createdAt: now,
        prStatus: 'none',
        prUrl: null,
      },
    ];

    window.localStorage.setItem('gravity_theme', 'dark');

    render(<App />);

    const ticketCard = await screen.findByText('Open detail ticket');
    expect(ticketCard).toBeInTheDocument();

    await user.click(ticketCard);

    // Detail opened
    expect(await screen.findByText('TST-10')).toBeInTheDocument();

    // Click Back button inside detail
    const backBtn = await screen.findByRole('button', { name: 'Back' });
    await user.click(backBtn);

    // Detail should close, header remains (project title or All Issues)
    await waitFor(() => {
      expect(screen.queryByText('TST-10')).not.toBeInTheDocument();
    });

    // Header should display something meaningful (not the ticket key)
    const header = document.querySelector('.workspace-header__title');
    expect(header).toBeTruthy();
    expect(header?.textContent).not.toContain('TST-10');
  });

  it('clicking a domain from the list/board filters tickets correctly', async () => {
    const user = userEvent.setup();

    // Prepare mock DB state
    dbState.currentUser = { id: 'usr-3', name: 'E2E User 3', email: 'e3@gravity.test', tutorial_completed: 1 } as any;
    dbState.accountSettings = { userId: dbState.currentUser.id, theme: 'dark', projectLayout: 'standard', notificationsEnabled: true } as any;
    dbState.workspaces = [{ id: 'wsp-3', name: 'E2E Workspace 3', defaultProjectId: 'prj-3', role: 'owner' }];
    dbState.projects = [{ id: 'prj-3', workspaceId: 'wsp-3', name: 'E2E Project 3', key: 'TST' }];
    dbState.domains = [
      { id: 'dom-frontend', projectId: 'prj-3', name: 'Frontend', slug: 'frontend' },
      { id: 'dom-backend', projectId: 'prj-3', name: 'Backend', slug: 'backend' },
    ];

    const now = new Date().toISOString();
    dbState.tickets = [
      {
        id: 't21',
        key: 'TST-21',
        title: 'Frontend only ticket',
        description: '',
        status: 'todo',
        priority: 'medium',
        projectId: 'prj-3',
        domainId: 'dom-frontend',
        cycleId: null,
        assigneeId: null,
        parentId: null,
        createdAt: now,
        prStatus: 'none',
        prUrl: null,
      },
      {
        id: 't22',
        key: 'TST-22',
        title: 'Backend only ticket',
        description: '',
        status: 'todo',
        priority: 'medium',
        projectId: 'prj-3',
        domainId: 'dom-backend',
        cycleId: null,
        assigneeId: null,
        parentId: null,
        createdAt: now,
        prStatus: 'none',
        prUrl: null,
      },
    ];

    window.localStorage.setItem('gravity_theme', 'dark');

    render(<App />);

    // Ensure both tickets are present initially
    expect(await screen.findByText('Frontend only ticket')).toBeInTheDocument();
    expect(await screen.findByText('Backend only ticket')).toBeInTheDocument();

    // Click the Frontend domain in the sidebar
    const domainButton = await screen.findByRole('button', { name: 'Frontend' });
    await user.click(domainButton);

    // Header should update
    expect(await screen.findByText('Frontend Domain', { selector: '.workspace-header__title' })).toBeInTheDocument();

    // Only frontend ticket should be visible
    expect(screen.getByText('Frontend only ticket')).toBeInTheDocument();
    expect(screen.queryByText('Backend only ticket')).not.toBeInTheDocument();
  });
});
