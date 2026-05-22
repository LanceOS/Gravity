import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import App from '../src/App';
import { dbState } from './setup';

describe('Gravity Client End-to-End User Journey', () => {
  it('should successfully execute the complete user flow from registration to ticket updates and theme changes', async () => {
    const user = userEvent.setup();

    // Set initial theme in localStorage to 'dark' to match E2E expectations
    window.localStorage.setItem('gravity_theme', 'dark');

    // Start with a fresh render of the full Application
    render(<App />);

    // ==========================================
    // PHASE 1: Sign-Up & Sign-In Screen Flow
    // ==========================================
    // Assert we start on the Auth screen since currentUser is null initially
    // We wait asynchronously for the initial session check to resolve and the AuthScreen to mount
    const bannerText = await screen.findByText('Production-grade Project Management Workspace');
    expect(bannerText).toBeInTheDocument();
    
    // Toggle to Sign Up form
    const signUpToggleBtn = await screen.findByRole('button', { name: /Don't have an account\? Sign Up/i });
    await user.click(signUpToggleBtn);

    // Assert "Full Name" input appears in the document
    const fullNameInput = await screen.findByLabelText(/Full Name/i);
    expect(fullNameInput).toBeInTheDocument();

    // Fill in sign up credentials
    await user.type(fullNameInput, 'Jane Developer');
    await user.type(screen.getByLabelText('Email Address', { selector: 'input' }), 'jane@gravity.dev');
    await user.type(screen.getByLabelText('Password', { selector: 'input' }), 'supersecret123');

    // Submit sign up form
    const createAccountBtn = screen.getByRole('button', { name: /Create Account/i });
    await user.click(createAccountBtn);

    // Verify user is now authenticated and dbState updated
    await waitFor(() => {
      expect(dbState.currentUser).not.toBeNull();
      expect(dbState.currentUser?.email).toBe('jane@gravity.dev');
    });

    // ==========================================
    // PHASE 2: Onboarding Tutorial Tour
    // ==========================================
    // Onboarding Modal should appear automatically
    const welcomeHeader = await screen.findByText(/Welcome to Gravity, Jane Developer!/i);
    expect(welcomeHeader).toBeInTheDocument();

    // Let's click "Let's do it!" to start the tour
    const startTourBtn = screen.getByRole('button', { name: /Let's do it!/i });
    await user.click(startTourBtn);

    // Step 1: Multi-Tenant Project Databases
    const step1Header = await screen.findByText(/Multi-Tenant Project Databases/i);
    expect(step1Header).toBeInTheDocument();
    let nextBtn = screen.getByRole('button', { name: /Next/i });
    await user.click(nextBtn);

    // Step 2: Cycles & Specialized Domains
    const step2Header = await screen.findByText(/Cycles & Specialized Domains/i);
    expect(step2Header).toBeInTheDocument();
    nextBtn = screen.getByRole('button', { name: /Next/i });
    await user.click(nextBtn);

    // Step 3: Local Ollama AI Assistant
    const step3Header = await screen.findByText(/Local Ollama AI Assistant/i);
    expect(step3Header).toBeInTheDocument();
    nextBtn = screen.getByRole('button', { name: /Next/i });
    await user.click(nextBtn);

    // Step 4: MCP Agent Integrations (Last step)
    const step4Header = await screen.findByText(/MCP Agent Integrations/i);
    expect(step4Header).toBeInTheDocument();
    const finishTourBtn = screen.getByRole('button', { name: /Finish Tour/i });
    await user.click(finishTourBtn);

    // Verify onboarding modal is closed and tutorial state updated
    await waitFor(() => {
      expect(screen.queryByText(/Workspace Tour/i)).not.toBeInTheDocument();
      expect(dbState.tutorialCompleted).toBe(true);
    });

    // ==========================================
    // PHASE 3: Workspace Directory & Creation
    // ==========================================
    // Since workspaces are empty initially, we should land on the Workspace Directory page
    const directoryHeader = await screen.findByText('Workspace Directory');
    expect(directoryHeader).toBeInTheDocument();
    expect(screen.getByText(/Choose where this account works/i)).toBeInTheDocument();

    // Fill in Workspace Creation inputs
    const wsNameInput = await screen.findByLabelText(/Workspace Name/i);
    await user.type(wsNameInput, 'Gravity Workspace');
    await user.type(screen.getByLabelText(/Workspace Key/i), 'GRV');
    await user.type(screen.getByLabelText(/Private Access Key/i), 'KEY123');
    await user.type(screen.getByLabelText(/Description/i), 'A beautiful E2E workspace.');

    // Submit workspace creation form
    const createWorkspaceBtn = screen.getByRole('button', { name: /Create Workspace/i });
    await user.click(createWorkspaceBtn);

    // Verify workspace created in dbState
    await waitFor(() => {
      expect(dbState.workspaces.length).toBe(1);
      expect(dbState.workspaces[0].name).toBe('Gravity Workspace');
    });

    // ==========================================
    // PHASE 4: Project Management Flow
    // ==========================================
    // Initially, there are no projects in the workspace. App renders empty workspace screen.
    const emptyProjText = await screen.findByText(/No projects in this workspace yet/i);
    expect(emptyProjText).toBeInTheDocument();

    // Click "Manage Projects" to open project manager
    const manageProjectsBtn = await screen.findByRole('button', { name: /Manage Projects/i });
    await user.click(manageProjectsBtn);

    // Verify we transitioned to project manager view
    const manageProjectsHeader = await screen.findByText('Manage Projects');
    expect(manageProjectsHeader).toBeInTheDocument();

    // Click "New Project" button in the WorkspaceProjectPanel
    const newProjectBtn = await screen.findByRole('button', { name: /New Project/i });
    await user.click(newProjectBtn);

    // Fill project creation modal form
    const prjNameInput = await screen.findByLabelText(/Project Name/i);
    await user.type(prjNameInput, 'Gravity Core');
    await user.type(screen.getByLabelText(/Project Key/i), 'GRV');
    await user.type(screen.getByLabelText(/Description/i), 'Main core project.');

    // Submit Project Creation
    const createProjectSubmitBtn = screen.getByRole('button', { name: /Create Project/i });
    await user.click(createProjectSubmitBtn);

    // Verify project created in dbState
    await waitFor(() => {
      expect(dbState.projects.length).toBe(1);
      expect(dbState.projects[0].name).toBe('Gravity Core');
    });

    console.log('DEBUG - dbState.projects:', JSON.stringify(dbState.projects));
    console.log('DEBUG - dbState.workspaces:', JSON.stringify(dbState.workspaces));

    // ==========================================
    // PHASE 5: Ticket Creation Flow
    // ==========================================
    // We are automatically redirected back to Workspace Page.
    // Because a project now exists, the "New Ticket" button is in the sidebar.
    const newTicketBtn = await screen.findByRole('button', { name: /New Ticket/i });
    await user.click(newTicketBtn);

    // Fill out Ticket Creation Modal
    const ticketTitleInput = await screen.findByPlaceholderText(/Issue title/i);
    await user.type(ticketTitleInput, 'Implement JSDOM E2E Suite');
    await user.type(screen.getByPlaceholderText(/Add description/i), 'Exhaustive flows for client integration.');

    // Submit Create Ticket
    const createTicketSubmitBtn = screen.getByRole('button', { name: /Create Issue/i });
    await user.click(createTicketSubmitBtn);

    // Verify ticket created in dbState
    await waitFor(() => {
      expect(dbState.tickets.length).toBe(1);
      expect(dbState.tickets[0].title).toBe('Implement JSDOM E2E Suite');
    });

    // Verify ticket appears on the board
    const ticketCardOnBoard = await screen.findByText('Implement JSDOM E2E Suite');
    expect(ticketCardOnBoard).toBeInTheDocument();

    // ==========================================
    // PHASE 6: Ticket Details and Comment Updates
    // ==========================================
    // Click on the ticket card to open ticket details
    await user.click(ticketCardOnBoard);

    // Verify details panel opened
    const ticketKeyText = await screen.findByText(/Ticket Key/i);
    expect(ticketKeyText).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Delete Ticket/i })).toBeInTheDocument();

    // Update the ticket status using the custom select dropdown
    const statusSelect = await screen.findByRole('button', { name: /Select ticket status/i });
    await user.click(statusSelect);

    const inProgressOption = await screen.findByRole('option', { name: /In Progress/i });
    await user.click(inProgressOption);

    // Verify status updated in dbState
    await waitFor(() => {
      expect(dbState.tickets[0].status).toBe('in_progress');
    });

    // Post a comment in the activity thread
    const commentInput = await screen.findByPlaceholderText(/Post updates, links, or mention PRs/i);
    await user.type(commentInput, 'E2E framework is up and running.');

    const commentBtn = screen.getByRole('button', { name: /^Comment$/i });
    await user.click(commentBtn);

    // Verify comment created in dbState and rendered
    await waitFor(() => {
      expect(dbState.comments.length).toBe(1);
      expect(dbState.comments[0].body).toBe('E2E framework is up and running.');
      expect(screen.getByText('E2E framework is up and running.')).toBeInTheDocument();
    });

    // ==========================================
    // PHASE 7: Theme Toggling & LocalStorage Check
    // ==========================================
    // Target the theme toggle button in the sidebar header
    const themeToggleBtn = await screen.findByRole('button', { name: /Current theme: .* Click to change./i });
    expect(themeToggleBtn).toBeInTheDocument();

    // Toggle theme once (toggles from dark to system)
    await user.click(themeToggleBtn);
    expect(window.localStorage.getItem('gravity_theme')).toBe('system');

    // Toggle theme again (toggles from system to light)
    await user.click(themeToggleBtn);
    expect(window.localStorage.getItem('gravity_theme')).toBe('light');
    expect(document.documentElement.classList.contains('light-theme')).toBe(true);
  });
});
