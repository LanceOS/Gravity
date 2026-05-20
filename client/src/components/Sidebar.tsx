import React, { useState, useRef, useEffect } from 'react';
import type { Cycle, Domain, Project, User } from '../context/TicketContext';
import type { TicketFilters } from '../utils/ticketView';
import { 
  Inbox, Database, LogOut, CheckCircle,
  Terminal, Cpu, Sparkles, ChevronDown, ChevronRight, Sliders, FolderTree, Settings2
} from 'lucide-react';

export interface SidebarProps {
  workspaces: Array<{ id: string; name: string }>;
  projects: Project[];
  domains: Domain[];
  cycles: Cycle[];
  currentUser: User;
  activeWorkspaceId: string;
  activeProjectId: string;
  filters: TicketFilters;
  myIssuesCount: number;
  activeProjectTicketCount: number;
  domainCounts: Record<string, number>;
  cycleCounts: Record<string, number>;
  activeArea?: 'workspace' | 'settings' | 'account';
  onSelectProject: (projectId: string) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onOpenWorkspaceDirectory: () => void;
  onShowProjectIssues: () => void;
  onShowMyIssues: () => void;
  onSelectCycle: (cycleId: string) => void;
  onSelectDomain: (domainId: string) => void;
  onOpenAccountPreferences: () => void;
  onSignOut: () => void;
  onOpenOllama: () => void;
  onOpenSimulator: () => void;
  onOpenCreateTicket: () => void;
  onOpenSettings: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  workspaces,
  projects,
  domains,
  cycles,
  currentUser,
  activeWorkspaceId,
  activeProjectId,
  filters,
  myIssuesCount,
  activeProjectTicketCount,
  domainCounts,
  cycleCounts,
  activeArea = 'workspace',
  onSelectProject,
  onSelectWorkspace,
  onOpenWorkspaceDirectory,
  onShowProjectIssues,
  onShowMyIssues,
  onSelectCycle,
  onSelectDomain,
  onOpenAccountPreferences,
  onSignOut,
  onOpenOllama,
  onOpenSimulator,
  onOpenCreateTicket,
  onOpenSettings,
}) => {
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [projectsCollapsed, setProjectsCollapsed] = useState(false);
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleProject = (projectId: string) => {
    if (projectId !== activeProjectId) {
      onSelectProject(projectId);
      setCollapsedProjects((previous) => ({ ...previous, [projectId]: false }));
      return;
    }

    setCollapsedProjects((previous) => ({ ...previous, [projectId]: !previous[projectId] }));
  };

  return (
    <aside 
      style={{
        width: '240px',
        background: 'var(--sidebar-bg)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0
      }}
    >
      {/* Brand Header */}
      <div 
        style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          borderBottom: '1px solid var(--border)'
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="var(--text-heading)" strokeWidth="2" />
          <circle cx="12" cy="12" r="6" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 2" />
          <circle cx="12" cy="12" r="2" fill="var(--text-heading)" />
        </svg>
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '6px' }}>
          <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-heading)', letterSpacing: '-0.3px' }}>Gravity</span>

          <select
            value={activeWorkspaceId}
            onChange={(event) => onSelectWorkspace(event.target.value)}
            style={{
              width: '100%',
              minHeight: '34px',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text-heading)',
              padding: '0 10px',
              fontSize: '12px'
            }}
          >
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.name}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={onOpenWorkspaceDirectory}
          className="clickable"
          style={{
            fontSize: '10px',
            background: 'var(--accent-glow)',
            border: '1px solid var(--accent-border)',
            color: 'var(--accent)',
            padding: '6px 8px',
            borderRadius: '8px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          All
        </button>
      </div>

      {/* Quick Action Button */}
      <div style={{ padding: '12px 16px 8px 16px' }}>
        <button 
          onClick={onOpenCreateTicket}
          className="btn btn-primary clickable"
          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}
        >
          <Sparkles size={14} />
          <span>New Ticket</span>
          <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '3px' }}>C</span>
        </button>
      </div>

      {/* Main Navigation Scroll Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
        <div style={{ marginTop: '16px' }}>
          <div 
            onClick={() => setProjectsCollapsed((previous) => !previous)}
            style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600, padding: '6px 8px', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            {projectsCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
            <span style={{ marginLeft: '4px' }}>Projects</span>
          </div>

          {!projectsCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '4px' }}>
              {projects.map((project) => {
                const isActiveProject = project.id === activeProjectId;
                const isCollapsed = collapsedProjects[project.id] ?? !isActiveProject;

                return (
                  <div key={project.id} style={{ display: 'grid', gap: '4px' }}>
                    <div
                      className="clickable"
                      onClick={() => toggleProject(project.id)}
                      style={menuItemStyle(isActiveProject)}
                    >
                      {isActiveProject && !isCollapsed ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <Database size={14} />
                      <span>{project.name}</span>
                    </div>

                    {isActiveProject && !isCollapsed ? (
                      <div style={{ marginLeft: '14px', paddingLeft: '10px', borderLeft: '1px solid var(--border)', display: 'grid', gap: '8px' }}>
                        <div style={sectionLabelStyle}>Views</div>

                        <div
                          className="clickable"
                          onClick={onShowProjectIssues}
                          style={nestedMenuItemStyle(filters.projectId === activeProjectId && !filters.assigneeId && !filters.domainId && !filters.cycleId)}
                        >
                          <FolderTree size={13} />
                          <span>All Issues</span>
                          <span style={countBadgeStyle()}>{activeProjectTicketCount}</span>
                        </div>

                        <div
                          className="clickable"
                          onClick={onShowMyIssues}
                          style={nestedMenuItemStyle(filters.projectId === activeProjectId && filters.assigneeId === currentUser.id && !filters.domainId && !filters.cycleId)}
                        >
                          <Inbox size={13} />
                          <span>My Issues</span>
                          <span style={countBadgeStyle()}>{myIssuesCount}</span>
                        </div>

                        <div style={sectionLabelStyle}>Cycles</div>
                        {cycles.map((cycle) => (
                          <div
                            key={cycle.id}
                            className="clickable"
                            onClick={() => onSelectCycle(cycle.id)}
                            style={nestedMenuItemStyle(filters.cycleId === cycle.id)}
                          >
                            <CheckCircle size={13} color={cycle.completed ? 'var(--text-muted)' : 'var(--accent)'} />
                            <span style={{ textDecoration: cycle.completed ? 'line-through' : 'none' }}>{cycle.name}</span>
                            <span style={countBadgeStyle()}>{cycleCounts[cycle.id] || 0}</span>
                          </div>
                        ))}

                        <div style={sectionLabelStyle}>Domains</div>
                        {domains.map((domain) => (
                          <div
                            key={domain.id}
                            className="clickable"
                            onClick={() => onSelectDomain(domain.id)}
                            style={nestedMenuItemStyle(filters.domainId === domain.id)}
                          >
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: domain.color }} />
                            <span>{domain.name}</span>
                            <span style={countBadgeStyle()}>{domainCounts[domain.id] || 0}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Agentic Tools Integration Indicators */}
        <div style={{ marginTop: '24px', padding: '8px', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '6px' }}>
            <Cpu size={12} color="var(--accent)" />
            <span>Agent Integrations</span>
          </div>
          
          <button 
            onClick={onOpenOllama}
            className="clickable"
            style={agentButtonStyle()}
          >
            <Sparkles size={12} color="var(--accent)" />
            <span>Ollama AI Assistant</span>
          </button>

          <button 
            onClick={onOpenSimulator}
            className="clickable"
            style={agentButtonStyle({ marginTop: '4px' })}
          >
            <Terminal size={12} />
            <span>MCP Agent Simulator</span>
          </button>
        </div>

      </div>

      {/* Interactive Footer Profile Panel */}
      <div 
        ref={profileRef}
        style={{
          borderTop: '1px solid var(--border)',
          padding: '12px 16px',
          position: 'relative'
        }}
      >
        <div 
          onClick={() => setShowUserDropdown(!showUserDropdown)}
          className="clickable"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          <img 
            src={currentUser.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=guest'} 
            alt={currentUser.name} 
            style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid var(--border)' }}
          />
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-heading)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              {currentUser.name}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>
              {currentUser.role || 'User'}
            </div>
          </div>
          <ChevronDown size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />
        </div>

        {/* User Switching / Auth Dropdown */}
        {showUserDropdown && (
          <div 
            style={{
              position: 'absolute',
              bottom: '100%',
              left: '16px',
              right: '16px',
              background: 'var(--card-bg)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              boxShadow: '0 -10px 15px -3px rgba(0,0,0,0.1), 0 -4px 6px -2px rgba(0,0,0,0.05)',
              padding: '6px',
              zIndex: 200,
              display: 'flex',
              flexDirection: 'column',
              gap: '2px',
              marginBottom: '6px'
            }}
          >
            <div style={{ padding: '6px 10px', fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
              Account & Settings
            </div>

            <div 
              onClick={() => {
                setShowUserDropdown(false);
                onOpenWorkspaceDirectory();
              }}
              className="clickable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: 'var(--text)'
              }}
            >
              <GlobeIcon />
              <span>Workspaces</span>
            </div>

            <div 
              onClick={() => {
                setShowUserDropdown(false);
                onOpenAccountPreferences();
              }}
              className="clickable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: activeArea === 'account' ? 'var(--text-heading)' : 'var(--text)',
                background: activeArea === 'account' ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                border: activeArea === 'account' ? '1px solid rgba(59, 130, 246, 0.18)' : '1px solid transparent'
              }}
            >
              <Sliders size={14} color="var(--accent)" />
              <span>Account Preferences</span>
            </div>

            <div 
              onClick={() => {
                setShowUserDropdown(false);
                onOpenSettings();
              }}
              className="clickable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                color: activeArea === 'settings' ? 'var(--text-heading)' : 'var(--text)',
                background: activeArea === 'settings' ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                border: activeArea === 'settings' ? '1px solid rgba(59, 130, 246, 0.18)' : '1px solid transparent'
              }}
            >
              <Settings2 size={14} color="var(--accent)" />
              <span>Workspace Settings</span>
            </div>

            <div 
              onClick={() => {
                setShowUserDropdown(false);
                onSignOut();
              }}
              className="clickable"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
                borderTop: '1px solid var(--border)',
                marginTop: '4px',
                color: 'var(--accent)'
              }}
            >
              <LogOut size={14} />
              <span>Log Out</span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
};

// Inline helper styling functions
const menuItemStyle = (isActive: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '6px 10px',
  borderRadius: '6px',
  fontSize: '13px',
  color: isActive ? 'var(--text-heading)' : 'var(--text)',
  background: isActive ? 'var(--border)' : 'transparent',
  fontWeight: isActive ? 500 : 400,
  cursor: 'pointer'
});

const nestedMenuItemStyle = (isActive: boolean): React.CSSProperties => ({
  ...menuItemStyle(isActive),
  fontSize: '12px',
  padding: '5px 8px'
});

const sectionLabelStyle: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 600,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  padding: '4px 8px 0 8px'
};

const countBadgeStyle = (): React.CSSProperties => ({
  marginLeft: 'auto',
  fontSize: '10px',
  color: 'var(--text-muted)',
  background: 'rgba(255,255,255,0.03)',
  padding: '1px 5px',
  borderRadius: '4px'
});

const agentButtonStyle = (extras: React.CSSProperties = {}): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '6px 8px',
  borderRadius: '4px',
  fontSize: '11px',
  fontWeight: 500,
  background: 'rgba(255,255,255,0.03)',
  border: '1px solid var(--border)',
  color: 'var(--text-heading)',
  textAlign: 'left',
  cursor: 'pointer',
  ...extras
});

function GlobeIcon() {
  return <FolderTree size={14} color="var(--accent)" />;
}
