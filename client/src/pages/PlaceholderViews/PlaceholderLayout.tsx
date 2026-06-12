import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  ListTodo, 
  Users, 
  Settings, 
  Download, 
  AlertTriangle, 
  ChevronRight, 
  Folder, 
  ArrowLeft, 
  BookOpen, 
  Layers, 
  Tag
} from 'lucide-react';
import './PlaceholderViews.css';

interface Breadcrumb {
  label: string;
  path?: string;
}

interface PlaceholderLayoutProps {
  breadcrumbs: Breadcrumb[];
  title: string;
  description: string;
  params?: Record<string, string | undefined>;
  degradation?: {
    message: string;
    targetPath: string;
    targetLabel: string;
  };
  children: React.ReactNode;
}

export function PlaceholderLayout({
  breadcrumbs,
  title,
  description,
  params = {},
  degradation,
  children,
}: PlaceholderLayoutProps) {
  const location = useLocation();

  // Define sidebar links representing all routes in the structure
  const sidebarLinks = [
    { label: 'Workspace Home', path: '/workspaces/wsp-1', icon: LayoutDashboard },
    { label: 'Workspace All Tasks', path: '/workspaces/wsp-1/all', icon: ListTodo },
    { label: 'Workspace Settings', path: '/workspaces/wsp-1/settings', icon: Settings },
    { label: 'Workspace Export', path: '/workspaces/wsp-1/settings/export', icon: Download },
    
    { header: 'Teams (Premium)' },
    { label: 'Team Overview', path: '/workspaces/wsp-1/teams/team-1', icon: Users },
    { label: 'Team All Tasks', path: '/workspaces/wsp-1/teams/team-1/tasks', icon: ListTodo },
    { label: 'Team Cycle View', path: '/workspaces/wsp-1/teams/team-1/cycles/cycle-1', icon: Layers },
    { label: 'Team Label View', path: '/workspaces/wsp-1/teams/team-1/labels/lbl-1', icon: Tag },
    { label: 'Team Project Overview', path: '/workspaces/wsp-1/teams/team-1/projects/prj-1', icon: Folder },
    { label: 'Team Project Tickets', path: '/workspaces/wsp-1/teams/team-1/projects/prj-1/tickets', icon: ListTodo },
    
    { header: 'Individual Routing' },
    { label: 'Project Ticket List', path: '/workspaces/wsp-1/projects/prj-1/tickets', icon: ListTodo },
    { label: 'Project Ticket Detail', path: '/workspaces/wsp-1/projects/prj-1/tickets/GRV-12', icon: ListTodo },
    { label: 'Project Notes List', path: '/workspaces/wsp-1/projects/prj-1/notes', icon: BookOpen },
    { label: 'Project Note Detail', path: '/workspaces/wsp-1/projects/prj-1/notes/note-45', icon: BookOpen },
  ];

  return (
    <div className="placeholder-container">
      {/* Mock Sidebar */}
      <aside className="placeholder-sidebar">
        <div className="placeholder-logo">
          <Layers size={22} style={{ color: '#818cf8' }} />
          <span>Gravity Router</span>
        </div>
        
        <nav style={{ flex: 1, overflowY: 'auto' }}>
          <ul className="placeholder-menu">
            {sidebarLinks.map((link, idx) => {
              if ('header' in link) {
                return (
                  <li key={`header-${idx}`} style={{ 
                    fontSize: '11px', 
                    fontWeight: 700, 
                    color: '#475569', 
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginTop: '16px',
                    marginBottom: '6px',
                    paddingLeft: '14px'
                  }}>
                    {link.header}
                  </li>
                );
              }
              
              const Icon = link.icon;
              const isActive = location.pathname === link.path;
              
              return (
                <li key={`link-${idx}`}>
                  <Link 
                    to={link.path} 
                    className={`placeholder-menu-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={16} />
                    <span>{link.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '16px' }}>
          <Link to="/" className="placeholder-menu-item" style={{ padding: '8px' }}>
            <ArrowLeft size={16} />
            <span>Back to Real App</span>
          </Link>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="placeholder-content-wrapper">
        <header className="placeholder-header">
          <div className="placeholder-breadcrumbs">
            {breadcrumbs.map((bc, idx) => (
              <React.Fragment key={idx}>
                {idx > 0 && <span className="placeholder-breadcrumbs-separator"><ChevronRight size={14} /></span>}
                {bc.path ? (
                  <Link to={bc.path} style={{ color: 'inherit', textDecoration: 'none' }}>{bc.label}</Link>
                ) : (
                  <span className={idx === breadcrumbs.length - 1 ? 'placeholder-breadcrumbs-active' : ''}>
                    {bc.label}
                  </span>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="placeholder-badge">
            Route Stub View
          </div>
        </header>

        <main className="placeholder-main">
          {/* Degradation Banner */}
          {degradation && (
            <div className="degradation-alert">
              <div className="degradation-alert-title">
                <AlertTriangle size={18} />
                <span>Graceful Degradation Rule Active</span>
              </div>
              <p className="degradation-alert-desc">
                {degradation.message}
              </p>
              <Link to={degradation.targetPath} style={{ textDecoration: 'none' }}>
                <button className="degradation-btn">
                  Redirect to {degradation.targetLabel}
                </button>
              </Link>
            </div>
          )}

          <div className="placeholder-title-section">
            <h1 className="placeholder-title">{title}</h1>
            <p className="placeholder-desc">{description}</p>
          </div>

          {/* Render Customized Child Content */}
          {children}

          {/* URL Parameters Inspection Panel */}
          {Object.keys(params).length > 0 && (
            <section className="placeholder-details" style={{ marginTop: '32px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', marginBottom: '16px' }}>
                Active Route Parameters (useParams)
              </h3>
              <div className="details-grid">
                {Object.entries(params).map(([key, val]) => (
                  <React.Fragment key={key}>
                    <div className="details-label">{key}</div>
                    <div className="details-value">
                      <code>{val || 'undefined'}</code>
                    </div>
                  </React.Fragment>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
