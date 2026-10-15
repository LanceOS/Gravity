import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useWorkspaceShellNavigation } from '../../src/modules/workspaces/hooks/useWorkspaceShellNavigation';
import { backFromSettings, openSettings } from '../../src/router/settingsNavigation';

export function Workspace() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const navigation = useWorkspaceShellNavigation({
    route: { workspaceId, teamIdParam: undefined, projectIdParam: undefined },
    // Simulate the render before shell state catches up with a workspace route change.
    activeWorkspaceId: workspaceId === 'ws-2' ? 'ws-1' : workspaceId,
    activeProjectId: '',
    projects: [],
    activeWorkspaceAvailable: true,
    currentUser: { id: 'user-1' },
    navigate,
    setSidebarActiveScope: () => {},
    setActiveProjectId: () => {},
    setActiveTicket: () => {},
  });

  return <main>
    <p data-testid="view">Workspace {workspaceId}: {location.pathname}{location.search}{location.hash}</p>
    <button onClick={navigation.handleOpenAccountPreferences}>User Settings</button>
    <button onClick={navigation.handleOpenSettings}>Workspace Settings</button>
  </main>;
}

export function Settings({ workspace = false }: { workspace?: boolean }) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const fallback = workspace ? `/workspaces/${workspaceId}` : '/workspaces';
  return <main>
    <p data-testid="view">{workspace ? 'Workspace Settings' : 'User Settings'}: {location.pathname}{location.search}</p>
    <button onClick={() => backFromSettings(navigate, location, fallback)}>Back</button>
  </main>;
}

export function Directory() {
  const navigate = useNavigate();
  const location = useLocation();
  return <main>
    <p data-testid="view">Directory: {location.pathname}{location.search}</p>
    <button onClick={() => openSettings(navigate, '/account')}>User Settings</button>
    <button onClick={() => openSettings(navigate, '/workspaces/ws-2/settings')}>Workspace Settings</button>
  </main>;
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter>
    <Routes>
      <Route path="/account" element={<Settings />} />
      <Route path="/workspaces/:workspaceId/settings" element={<Settings workspace />} />
      <Route path="/workspaces" element={<Directory />} />
      <Route path="/workspaces/:workspaceId/*" element={<Workspace />} />
    </Routes>
  </BrowserRouter>
);
