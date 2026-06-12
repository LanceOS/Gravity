import { Link } from 'react-router-dom';
import type { Project, Ticket } from '../../context/TicketContext';
import './Breadcrumbs.css';

interface BreadcrumbsProps {
  pathname: string;
  workspaceId: string;
  projects: Project[];
  activeTicket?: Ticket | null;
  activeNoteId?: string;
  /** Label override for the current workspace (defaults to "Workspace") */
  workspaceName?: string;
}

interface Crumb {
  label: string;
  to?: string;
}

function getReadableLabel(segment: string) {
  return segment
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildBreadcrumbs({
  pathname,
  workspaceId,
  workspaceName,
  projects,
  activeTicket,
  activeNoteId,
}: BreadcrumbsProps): Crumb[] {
  const normalizedPath = pathname.split('?')[0].replace(/\/+$/, '');
  const segments = normalizedPath.split('/').filter(Boolean);

  if (segments[0] !== 'workspaces' || segments[1] !== workspaceId) {
    return [];
  }

  const crumbs: Crumb[] = [
    {
      label: workspaceName || 'Workspace',
      to: `/workspaces/${workspaceId}`,
    },
  ];

  const remainder = segments.slice(2);
  if (remainder.length === 0) {
    return crumbs;
  }

  let currentBase = `/workspaces/${workspaceId}`;

  for (let index = 0; index < remainder.length; ) {
    const segment = remainder[index];

    if (segment === 'teams') {
      const teamId = remainder[index + 1];
      if (!teamId) {
        break;
      }

      currentBase = `${currentBase}/teams/${teamId}`;
      const hasChildren = index + 2 < remainder.length;
      crumbs.push({
        label: 'Team',
        to: hasChildren ? currentBase : undefined,
      });
      index += 2;
      continue;
    }

    if (segment === 'projects') {
      const projectId = remainder[index + 1];
      if (!projectId) {
        crumbs.push({ label: 'Projects' });
        break;
      }

      const project = projects.find((item) => item.id === projectId);
      const projectPath = `${currentBase}/projects/${projectId}`;
      const hasChildren = index + 2 < remainder.length;

      crumbs.push({
        label: project?.name || 'Project',
        to: hasChildren ? projectPath : undefined,
      });

      currentBase = projectPath;
      index += 2;
      continue;
    }

    if (segment === 'tickets') {
      const ticketKey = remainder[index + 1];
      const ticketsPath = `${currentBase}/tickets`;

      if (ticketKey) {
        crumbs.push({
          label: 'Tickets',
          to: ticketsPath,
        });
        crumbs.push({
          label: activeTicket?.key || ticketKey || 'Ticket',
        });
        break;
      }

      crumbs.push({ label: 'Tickets' });
      break;
    }

    if (segment === 'notes') {
      const noteId = remainder[index + 1];
      const notesPath = `${currentBase}/notes`;

      if (noteId) {
        crumbs.push({
          label: 'Notes',
          to: notesPath,
        });
        crumbs.push({
          label: activeNoteId || noteId || 'Note',
        });
        break;
      }

      crumbs.push({ label: 'Notes' });
      break;
    }

    if (segment === 'settings') {
      crumbs.push({ label: 'Settings' });
      break;
    }

    if (segment === 'labels' || segment === 'domains') {
      const domainId = remainder[index + 1];
      const domainsPath = `${currentBase}/labels`;

      if (domainId) {
        crumbs.push({
          label: 'Labels',
          to: domainsPath,
        });
        crumbs.push({
          label: getReadableLabel(domainId),
        });
      } else {
        crumbs.push({ label: 'Labels' });
      }

      break;
    }

    if (segment === 'cycles') {
      const cycleId = remainder[index + 1];
      const cyclesPath = `${currentBase}/cycles`;

      if (cycleId) {
        crumbs.push({
          label: 'Cycles',
          to: cyclesPath,
        });
        crumbs.push({
          label: getReadableLabel(cycleId),
        });
      } else {
        crumbs.push({ label: 'Cycles' });
      }

      break;
    }

    if (segment === 'views') {
      const viewId = remainder[index + 1];
      const viewsPath = `${currentBase}/views`;

      if (viewId) {
        crumbs.push({
          label: 'Views',
          to: viewsPath,
        });
        crumbs.push({
          label: getReadableLabel(viewId),
        });
      } else {
        crumbs.push({ label: 'Views' });
      }

      break;
    }

    if (segment === 'all') {
      crumbs.push({ label: 'All Tasks' });
      break;
    }

    crumbs.push({ label: getReadableLabel(segment) });
    break;
  }

  return crumbs;
}

export function Breadcrumbs(props: BreadcrumbsProps) {
  const crumbs = buildBreadcrumbs(props);

  if (crumbs.length <= 1) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs">
      <ol className="breadcrumbs__list">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${index}`} className="breadcrumbs__item">
              {!isLast && crumb.to ? (
                <Link to={crumb.to} className="breadcrumbs__link">
                  {crumb.label}
                </Link>
              ) : (
                <span
                  className={`breadcrumbs__current${isLast ? ' breadcrumbs__current--active' : ''}`}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {crumb.label}
                </span>
              )}
              {!isLast && (
                <span className="breadcrumbs__sep" aria-hidden="true">
                  /
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
