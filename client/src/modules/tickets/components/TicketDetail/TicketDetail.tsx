import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { Ticket } from '../../../../context/TicketContext';
import { Button, Select, MarkdownEditor, RichTextEditor, toast, ClickAwayListener, Portal, Accordion, Popover, createEmptyRichTextValue, isRichTextEmpty, serializeRichTextMarkdown } from '@library';
import generateBranchName from '../../../../utils/branch';
import TicketUtilities from '../TicketUtilities/TicketUtilities';

const DEFAULT_TICKET_URL_BASE = 'https://tickets.placeholder.local';

const RAW_ALLOWED_TICKET_HOSTS = (typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_ALLOWED_TICKET_HOSTS) || undefined;

function parseAllowedHosts(raw?: string): string[] {
  if (!raw) return [new URL(DEFAULT_TICKET_URL_BASE).hostname];
  return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
}

const ALLOWED_TICKET_HOSTS = parseAllowedHosts(RAW_ALLOWED_TICKET_HOSTS);

/**
 * Determine whether a parsed URL matches any allowlist entry.
 * Supported allowlist entry formats:
 *  - exact hostname: example.com
 *  - wildcard subdomain: *.example.com  (matches a.example.com but not example.com)
 *  - host with port: example.com:8080
 *  - '*' to allow any host (not recommended)
 */
function isHostAllowed(url: URL, allowed: string[]): boolean {
  const hostname = url.hostname.toLowerCase();
  const hostWithPort = url.host.toLowerCase();

  for (const rawEntry of allowed) {
    const entry = rawEntry.toLowerCase();
    if (!entry) continue;
    if (entry === '*') return true;

    // Explicit host:port match
    if (entry.includes(':')) {
      if (hostWithPort === entry) return true;
      continue;
    }

    // Wildcard subdomain match: *.example.com matches api.example.com
    if (entry.startsWith('*.')) {
      const root = entry.slice(2);
      if (!root) continue;
      if (hostname === root) continue; // do not match root domain for wildcard
      if (hostname.endsWith('.' + root)) return true;
      continue;
    }

    // Exact hostname match
    if (hostname === entry) return true;
  }

  return false;
}

function sanitizeTicketUrlBase(raw?: string): string {
  if (!raw) return DEFAULT_TICKET_URL_BASE;
  if (raw.startsWith('/')) return raw.replace(/\/$/, '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return DEFAULT_TICKET_URL_BASE;
    if (!isHostAllowed(url, ALLOWED_TICKET_HOSTS)) return DEFAULT_TICKET_URL_BASE;
    return url.origin.replace(/\/$/, '');
  } catch {
    return DEFAULT_TICKET_URL_BASE;
  }
}

const TICKET_URL_BASE = sanitizeTicketUrlBase((typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_TICKET_URL_BASE) || undefined);
import {
  GitPullRequest, GitMerge, Send, Trash2,
  Plus, Edit3, ChevronLeft, MoreHorizontal, Link, FileText, CornerLeftUp
} from 'lucide-react';
import { MarkdownContent } from '../MarkdownContent';
import { CommentEditor } from '../CommentEditor/CommentEditor';
import { TicketRow } from '../TicketRow';
import { TicketRowMobile } from '../TicketRowMobile/TicketRowMobile';
import { getPriorityIcon, getAssigneeAvatar } from '../../utils/TicketList';
import type { TicketDetailProps } from '../../types/TicketDetail';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../utils/TicketDetail';
import { useTickets } from '../../../../context/TicketContext';
import { LabelBadge } from '../LabelBadge';
import { SearchableOptionPickerPopoverContent } from '../SearchableOptionPickerPopoverContent';
import { TicketContextMenu } from '../TicketContextMenu';
import './TicketDetail.css';

export const TicketDetail: React.FC<TicketDetailProps> = ({
  activeTicket,
  activeTicketDetail,
  comments,
  subtasks,
  availableTickets,
  completedSubtasks,
  subtaskProgressPercent,
  users,
  projects,
  labels,
  cycles,
  onSelectTicket,
  onUpdateTicket,
  onDeleteTicket,
  onAddComment,
  onUpdateComment,
  onDeleteComment,
  onClose,
  onOpenCreateSubtask,
  onAddDependency,
  onRemoveDependency,
  onAddBlocker,
  onRemoveBlocker,
  parentTicket,
  ticketLink: customTicketLink,
}) => {
  const [commentInput, setCommentInput] = useState(createEmptyRichTextValue());
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  const { assignLabelToTicket, unassignLabelFromTicket, createLabel: createLabelInContext } = useTickets();

  const handleAssignLabel = useCallback(async (labelId: string) => {
    await assignLabelToTicket(activeTicket.id, labelId);
  }, [assignLabelToTicket, activeTicket.id]);

  const handleUnassignLabel = useCallback(async (labelId: string) => {
    await unassignLabelFromTicket(activeTicket.id, labelId);
  }, [unassignLabelFromTicket, activeTicket.id]);

  const handleAddDependency = useCallback(async (dependencyId: string) => {
    if (!dependencyId) return;
    const success = await onAddDependency(activeTicket.id, dependencyId);
    if (success && toast?.show) {
      toast.show('Dependency added successfully', 'success');
    }
  }, [onAddDependency, activeTicket.id]);

  const handleRemoveDependency = useCallback(async (dependencyId: string) => {
    const success = await onRemoveDependency(activeTicket.id, dependencyId);
    if (success && toast?.show) {
      toast.show('Dependency removed', 'success');
    }
  }, [onRemoveDependency, activeTicket.id]);

  const handleAddBlocker = useCallback(async (blockerId: string) => {
    if (!onAddBlocker) return;
    if (!blockerId) return;
    const success = await onAddBlocker(activeTicket.id, blockerId);
    if (success && toast?.show) {
      toast.show('Blocker added successfully', 'success');
    }
  }, [onAddBlocker, activeTicket.id]);

  const handleRemoveBlocker = useCallback(async (blockerId: string) => {
    if (!onRemoveBlocker) return;
    const success = await onRemoveBlocker(activeTicket.id, blockerId);
    if (success && toast?.show) {
      toast.show('Blocker removed', 'success');
    }
  }, [onRemoveBlocker, activeTicket.id]);

  const canManageBlockers = typeof onAddBlocker === 'function' && typeof onRemoveBlocker === 'function';

  const dependencyLinks = activeTicketDetail?.dependencies || [];
  const blockerLinks = activeTicketDetail?.blockers || (activeTicketDetail?.blockedTicket ? [activeTicketDetail.blockedTicket] : []);
  const labelOptions = useMemo(() => {
    return labels
      .filter((label) => label.projectId === activeTicket.projectId || !label.projectId)
      .map((label) => ({
        id: label.id,
        label: label.name,
        description: label.description || undefined,
        color: label.color,
        searchText: [label.name, label.description].filter(Boolean).join(' '),
      }));
  }, [labels, activeTicket.projectId]);

  const dependencyTicketIds = useMemo(() => new Set(dependencyLinks.map((dependency) => dependency.id)), [dependencyLinks]);
  const blockerTicketIds = useMemo(() => new Set(blockerLinks.map((blocker) => blocker.id)), [blockerLinks]);
  const relatedTicketIds = useMemo(() => {
    return new Set(activeTicketDetail?.relatedTicketIds || []);
  }, [activeTicketDetail?.relatedTicketIds]);
  const isCompatibleRelationCandidate = useCallback((ticketId: string) => {
    return ticketId !== activeTicket.id && !relatedTicketIds.has(ticketId);
  }, [activeTicket.id, relatedTicketIds]);
  const availableTicketsById = useMemo(() => {
    const ticketMap = new Map(availableTickets.map((ticket) => [ticket.id, ticket]));
    if (parentTicket) {
      ticketMap.set(parentTicket.id, parentTicket);
    }
    return ticketMap;
  }, [availableTickets, parentTicket]);
  const usersById = useMemo(() => new Map(users.map((user) => [user.id, user])), [users]);

  const ticketOptions = useMemo(() => {
    return availableTickets
      .filter((ticket) => isCompatibleRelationCandidate(ticket.id))
      .map((ticket) => ({
        id: ticket.id,
        label: ticket.key,
        description: ticket.title,
        searchText: [ticket.key, ticket.title].filter(Boolean).join(' '),
      }));
  }, [availableTickets, isCompatibleRelationCandidate]);

  const configurationEntries = useMemo(() => {
    const resolveAssignee = (ticket: Ticket | null) => {
      if (!ticket?.assigneeId) {
        return { name: 'Unassigned', avatar: '' };
      }

      const assignee = usersById.get(ticket.assigneeId);
      return {
        name: assignee?.name || 'Unknown member',
        avatar: assignee?.avatar || '',
      };
    };

    const entries: Array<{
      id: string;
      relation: string;
      key: string;
      title: string;
      assigneeName: string;
      assigneeAvatar: string;
      resolvedTicket: Ticket | null;
    }> = [];

    if (parentTicket) {
      const assignee = resolveAssignee(parentTicket);
      entries.push({
        id: `parent-${parentTicket.id}`,
        relation: 'Sub-ticket of',
        key: parentTicket.key,
        title: parentTicket.title,
        assigneeName: assignee.name,
        assigneeAvatar: assignee.avatar,
        resolvedTicket: parentTicket,
      });
    }

    blockerLinks.forEach((blocker) => {
      const resolvedTicket = availableTicketsById.get(blocker.id) || null;
      const assignee = resolveAssignee(resolvedTicket);
      entries.push({
        id: `blocker-${blocker.id}`,
        relation: 'Blocked by',
        key: blocker.key,
        title: blocker.title,
        assigneeName: assignee.name,
        assigneeAvatar: assignee.avatar,
        resolvedTicket,
      });
    });

    dependencyLinks.forEach((dependency) => {
      const resolvedTicket = availableTicketsById.get(dependency.id) || null;
      const assignee = resolveAssignee(resolvedTicket);
      entries.push({
        id: `dependency-${dependency.id}`,
        relation: 'Blocks',
        key: dependency.key,
        title: dependency.title,
        assigneeName: assignee.name,
        assigneeAvatar: assignee.avatar,
        resolvedTicket,
      });
    });

    return entries;
  }, [availableTicketsById, blockerLinks, dependencyLinks, parentTicket, usersById]);

  const handleCreateLabel = useCallback(async (name: string, color: string) => {
    const newLabel = await createLabelInContext({
      name,
      color,
      projectId: activeTicket.projectId,
      description: '',
    });
    if (newLabel) {
      await assignLabelToTicket(activeTicket.id, newLabel.id);
    }
  }, [createLabelInContext, assignLabelToTicket, activeTicket.id, activeTicket.projectId]);

  const handleToggleLabel = useCallback(async (labelId: string, isSelected: boolean) => {
    if (isSelected) {
      await handleUnassignLabel(labelId);
      return;
    }

    await handleAssignLabel(labelId);
  }, [handleAssignLabel, handleUnassignLabel]);

  const handleToggleDependency = useCallback(async (dependencyId: string, isSelected: boolean) => {
    if (isSelected || !isCompatibleRelationCandidate(dependencyId)) {
      return;
    }

    await handleAddDependency(dependencyId);
  }, [handleAddDependency, isCompatibleRelationCandidate]);

  const handleToggleBlocker = useCallback(async (blockerId: string, isSelected: boolean) => {
    if (isSelected || !isCompatibleRelationCandidate(blockerId)) {
      return;
    }

    await handleAddBlocker(blockerId);
  }, [handleAddBlocker, isCompatibleRelationCandidate]);

  const renderAddRelationTrigger = (buttonLabel: string) => (
    <button
      type="button"
      className="ticket-detail__inline-trigger"
    >
      <Plus size={10} />
      <span>{buttonLabel}</span>
    </button>
  );

  const [openMenuCommentId, setOpenMenuCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentBody, setEditingCommentBody] = useState<string>('');
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const [editingDescriptionBody, setEditingDescriptionBody] = useState(() => activeTicket.description || createEmptyRichTextValue());
  const lastSavedDescriptionRef = useRef(activeTicket.description);
  const prevDescriptionRef = useRef(activeTicket.description);
  const descriptionTicketIdRef = useRef(activeTicket.id);

  const closeCommentMenu = useCallback(() => setOpenMenuCommentId(null), []);

  useEffect(() => {
    const isNewTicket = descriptionTicketIdRef.current !== activeTicket.id;
    const nextDescription = activeTicket.description || createEmptyRichTextValue();

    if (isNewTicket) {
      descriptionTicketIdRef.current = activeTicket.id;
      setEditingDescriptionBody(nextDescription);
      lastSavedDescriptionRef.current = activeTicket.description;
      prevDescriptionRef.current = activeTicket.description;
    } else {
      const wasSavedByUs = activeTicket.description === lastSavedDescriptionRef.current;
      if (!wasSavedByUs && activeTicket.description !== prevDescriptionRef.current) {
        setEditingDescriptionBody(nextDescription);
        lastSavedDescriptionRef.current = activeTicket.description;
        prevDescriptionRef.current = activeTicket.description;
      } else {
        prevDescriptionRef.current = activeTicket.description;
      }
    }
  }, [activeTicket.id, activeTicket.description]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (editingDescriptionBody !== lastSavedDescriptionRef.current) {
        lastSavedDescriptionRef.current = editingDescriptionBody;
        void onUpdateTicket(activeTicket.id, { description: editingDescriptionBody });
      }
    }, 1500);

    return () => clearTimeout(timeoutId);
  }, [editingDescriptionBody, activeTicket.id, onUpdateTicket]);

  const handleDescriptionBlur = useCallback(() => {
    if (editingDescriptionBody !== lastSavedDescriptionRef.current) {
      lastSavedDescriptionRef.current = editingDescriptionBody;
      void onUpdateTicket(activeTicket.id, { description: editingDescriptionBody });
    }
  }, [editingDescriptionBody, activeTicket.id, onUpdateTicket]);

  const ticketLink = useMemo(() => customTicketLink || `${TICKET_URL_BASE}/${activeTicket.key}`, [customTicketLink, activeTicket.key]);

  const generatedBranchName = useMemo(
    () => (activeTicket.branchName ? activeTicket.branchName : generateBranchName(activeTicket.key, activeTicket.title)),
    [activeTicket.branchName, activeTicket.key, activeTicket.title]
  );

  const copyToClipboard = useCallback(async (value: string, successMessage?: string) => {
    const isDev = Boolean(typeof import.meta !== 'undefined' && (import.meta as unknown as { env?: Record<string, unknown> }).env?.DEV);

    if (!navigator.clipboard?.writeText) {
      if (isDev && console && console.warn) {
        console.warn('Clipboard API not available in this environment; copy action skipped.');
      }
      if (toast?.show) toast.show('Clipboard not supported', 'warning');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      if (toast?.show) toast.show(successMessage || 'Copied to clipboard', 'success');
    } catch (err) {
      if (isDev && console && console.error) {
        console.error('Failed to write to clipboard', err);
      }
      if (toast?.show) toast.show('Failed to copy', 'error');
    }
  }, []);

  const handlePostComment = (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!isRichTextEmpty(commentInput)) {
      onAddComment(activeTicket.id, commentInput);
      setCommentInput(createEmptyRichTextValue());
    }
  };

  const handleDelete = () => {
    setIsDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    await onDeleteTicket(activeTicket.id);
    setIsDeleteConfirmOpen(false);
  };

  const assigneeOptions = [{ value: '', label: 'Unassigned' }, ...users.map((user) => ({ value: user.id, label: user.name }))];
  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  const cycleOptions = [{ value: '', label: 'No Cycle' }, ...cycles.map((cycle) => ({ value: cycle.id, label: cycle.name }))];

  const propertiesContent = (
    <div className="ticket-detail__properties-grid">
      <TicketUtilities
        ticketLink={ticketLink}
        generatedBranchName={generatedBranchName}
        description={activeTicket.description || ''}
        onCopy={copyToClipboard}
      />

      <div>
        <span className="label">Ticket Key</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: '15px', fontWeight: 600, color: 'var(--color-primary)', display: 'block', marginTop: '6px' }}>
          {activeTicket.key}
        </span>
      </div>

      <div>
        <span className="label">Status</span>
        <Select
          value={activeTicket.status}
          onValueChange={(nextStatus: string) => onUpdateTicket(activeTicket.id, { status: nextStatus as Ticket['status'] })}
          options={STATUS_OPTIONS}
          aria-label="Select ticket status"
        />
      </div>

      <div>
        <span className="label" style={{ marginBottom: '8px', display: 'block' }}>Labels</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
          {activeTicket.labels && activeTicket.labels.length > 0 ? (
            activeTicket.labels.map((l) => (
              <LabelBadge
                key={l.id}
                label={l}
                size="sm"
                onRemove={() => handleUnassignLabel(l.id)}
              />
            ))
          ) : (
            <span style={{ fontSize: '12px', color: 'var(--color-text-disabled)', fontStyle: 'italic' }}>
              No labels assigned
            </span>
          )}

          <Popover
            align="center"
            contentClassName="ticket-detail__label-popover"
            trigger={renderAddRelationTrigger('Add Label')}
          >
            <SearchableOptionPickerPopoverContent
              title="Search or Create Label"
              searchPlaceholder="Type to search or create..."
              options={labelOptions}
              selectedIds={new Set(activeTicket.labels?.map((l) => l.id) || [])}
              onToggle={handleToggleLabel}
              onCreate={handleCreateLabel}
              createHeading="CREATE NEW LABEL:"
              emptyStateLabel="No matching labels"
            />
          </Popover>
        </div>
      </div>

      <div>
        <span className="label">Priority</span>
        <Select
          value={activeTicket.priority}
          onValueChange={(nextPriority: string) => onUpdateTicket(activeTicket.id, { priority: nextPriority as Ticket['priority'] })}
          options={PRIORITY_OPTIONS}
          aria-label="Select ticket priority"
        />
      </div>

      <div>
        <span className="label">Assignee</span>
        <Select
          value={activeTicket.assigneeId || ''}
          onValueChange={(nextAssigneeId: string) => onUpdateTicket(activeTicket.id, { assigneeId: nextAssigneeId || null })}
          options={assigneeOptions}
          aria-label="Select ticket assignee"
        />
      </div>

      <div>
        <span className="label">Project</span>
        <Select
          value={activeTicket.projectId}
          options={projectOptions}
          aria-label="Select ticket project"
          disabled
        />
        <div style={{ marginTop: '6px', fontSize: '11px', color: 'var(--color-text-disabled)', lineHeight: '1.4' }}>
          Project moves are managed outside ticket details to keep ticket keys and related project data consistent.
        </div>
      </div>



      <div>
        <span className="label">Cycle / Milestone</span>
        <Select
          value={activeTicket.cycleId || ''}
          onValueChange={(nextCycleId: string) => onUpdateTicket(activeTicket.id, { cycleId: nextCycleId || null })}
          options={cycleOptions}
          aria-label="Select ticket cycle"
        />
      </div>

      <div style={{ borderTop: '1px solid var(--color-border-default)', paddingTop: '16px', marginTop: '8px' }}>
        <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
          <Link size={12} />
          <span>Dependencies</span>
        </span>

        {dependencyLinks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
            {dependencyLinks.map((dep: any) => (
              <div key={dep.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-base100)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                <span className="clickable" style={{ color: 'var(--color-primary)', fontWeight: 500, cursor: 'pointer' }} onClick={() => onSelectTicket(dep)}>
                  {dep.key}
                </span>
                <button
                  type="button"
                  onClick={() => handleRemoveDependency(dep.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--color-text-disabled)', cursor: 'pointer', display: 'flex', padding: '2px' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--color-error)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-disabled)'}
                  aria-label={`Remove dependency ${dep.key}`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', fontStyle: 'italic', marginBottom: '8px' }}>
            No dependencies
          </div>
        )}

        <Popover
          align="left"
          style={{ display: 'block' }}
          contentClassName="ticket-detail__label-popover"
          trigger={renderAddRelationTrigger('Add Dependency')}
        >
          <SearchableOptionPickerPopoverContent
            title="Search Tickets"
            searchPlaceholder="Type to search tickets..."
            options={ticketOptions}
            selectedIds={dependencyTicketIds}
            onToggle={handleToggleDependency}
            emptyStateLabel="No matching tickets"
            showCheckbox={false}
          />
        </Popover>

        <div style={{ marginTop: '16px', borderTop: '1px dashed var(--color-border-default)', paddingTop: '12px' }}>
          <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
            <Link size={12} />
            <span>Blockers</span>
          </span>

          {blockerLinks.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
              {blockerLinks.map((blocker: any) => (
                <div key={blocker.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--color-base100)', padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                  <span className="clickable" style={{ color: 'var(--color-primary)', fontWeight: 500, cursor: 'pointer' }} onClick={() => onSelectTicket(blocker)}>
                    {blocker.key}
                  </span>
                  {canManageBlockers && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBlocker(blocker.id)}
                      style={{ background: 'none', border: 'none', color: 'var(--color-text-disabled)', cursor: 'pointer', display: 'flex', padding: '2px' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--color-error)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--color-text-disabled)'}
                      aria-label={`Remove blocker ${blocker.key}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: '11px', color: 'var(--color-text-disabled)', fontStyle: 'italic', marginBottom: '8px' }}>
              No blockers
            </div>
          )}

          {canManageBlockers && (
            <Popover
              align="left"
              style={{ display: 'block' }}
              contentClassName="ticket-detail__label-popover"
              trigger={renderAddRelationTrigger('Add Blocker')}
            >
              <SearchableOptionPickerPopoverContent
                title="Search Tickets"
                searchPlaceholder="Type to search tickets..."
                options={ticketOptions}
                selectedIds={blockerTicketIds}
                onToggle={handleToggleBlocker}
                emptyStateLabel="No matching tickets"
                showCheckbox={false}
              />
            </Popover>
          )}
        </div>
      </div>

      <div style={{ gridColumn: '1 / -1', borderTop: '1px solid var(--color-border-default)', paddingTop: '16px', marginTop: '8px' }}>
        <span className="label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <GitPullRequest size={12} />
          <span>GitHub Connection</span>
        </span>

        {activeTicket.prStatus !== 'none' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '6px' }}>
            <a
              href={activeTicket.prUrl || '#'}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '8px',
                borderRadius: '6px',
                background: activeTicket.prStatus === 'merged' ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.1)',
                border: `1px solid ${activeTicket.prStatus === 'merged' ? '#10b981' : '#3b82f6'}30`,
                color: activeTicket.prStatus === 'merged' ? '#10b981' : '#3b82f6',
                textDecoration: 'none',
                fontWeight: 500,
                fontSize: '12px'
              }}
              className="clickable"
            >
              {activeTicket.prStatus === 'merged' ? <GitMerge size={14} /> : <GitPullRequest size={14} />}
              <span>PR Status: {activeTicket.prStatus.toUpperCase()}</span>
            </a>
            <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)', textAlign: 'center' }}>
              Auto-updated via webhook hooks
            </span>
          </div>
        ) : (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--color-text-disabled)',
              background: 'rgba(255,255,255,0.01)',
              border: '1px dashed var(--color-border-default)',
              borderRadius: '6px',
              padding: '10px',
              marginTop: '6px',
              lineHeight: '1.4'
            }}
          >
            No PR linked. Mention key <strong>{activeTicket.key}</strong> in PR title or branch (e.g. <code>feature/{activeTicket.key}-auth</code>) to link automatically.
          </div>
        )}
      </div>
    </div>
  );
  return (
    <>
      <TicketContextMenu ticket={activeTicket} availableTickets={availableTickets}>
        <div className="ticket-detail">
          <div className="ticket-detail__header">
          <Button
            onClick={() => onClose ? onClose() : window.history.back()}
            variant="ghost"
            size="sm"
            className="ticket-detail__back-btn clickable"
          >
            <ChevronLeft size={16} />
            <span className="ticket-detail__back-text">Back</span>
          </Button>

          <span className="ticket-detail__sep">/</span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)', whiteSpace: 'nowrap' }}>
              {activeTicket.key}
            </span>

            {parentTicket ? (
              <>
                <span className="ticket-parent-ref">
                  <span className="ticket-parent-label">Sub ticket of</span>
                  <button
                    type="button"
                    onClick={() => onSelectTicket(parentTicket)}
                    className="ticket-parent-btn clickable"
                    aria-label={`${parentTicket.key} - ${parentTicket.title}`}
                  >
                    <span className="ticket-parent-key">{parentTicket.key}</span>
                    <span className="ticket-parent-title">{` - ${parentTicket.title}`}</span>
                  </button>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ticket-parent-mobile-btn"
                  onClick={() => onSelectTicket(parentTicket)}
                  aria-label={`Parent ticket: ${parentTicket.key}`}
                  style={{ padding: '4px 10px', fontSize: '12.5px', height: '28px' }}
                >
                  <CornerLeftUp size={14} />
                  <span>Parent</span>
                </Button>
              </>
            ) : null}
          </div>

          <Button
            onClick={handleDelete}
            variant="danger"
            size="sm"
            className="ticket-detail__delete-btn"
          >
            <Trash2 size={14} />
            <span>Delete Ticket</span>
          </Button>
        </div>

        <div className="ticket-detail__body">

          <div className="ticket-detail__content">

            <div className="ticket-detail__accordion-mobile">
              <Accordion
                items={[
                  {
                    id: 'ticket-details',
                    title: 'Ticket Details',
                    content: propertiesContent
                  }
                ]}
              />
            </div>

            <div>
              <MarkdownEditor
                value={activeTicket.title}
                onSave={(newTitle) => onUpdateTicket(activeTicket.id, { title: newTitle })}
                singleLine={true}
                minHeight="auto"
                className="ticket-title-editor"
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>Description</span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                <RichTextEditor
                  key={`desc-${activeTicket.id}`}
                  value={editingDescriptionBody}
                  onChange={setEditingDescriptionBody}
                  onBlur={handleDescriptionBlur}
                  placeholder="Describe your issue..."
                  className="ticket-detail__description-editor"
                  surface="bare"
                  toolbarMode="bubble"
                />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>
                  Sub-tasks Checklist
                </span>

                <Button
                  onClick={() => onOpenCreateSubtask(activeTicket.id)}
                  variant="ghost"
                  size="sm"
                  style={{ marginLeft: 'auto', padding: '2px 8px', fontSize: '11px' }}
                >
                  <Plus size={12} />
                  <span>Add Subtask</span>
                </Button>
              </div>

              {subtasks.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ flex: 1, height: '4px', background: 'var(--color-border-default)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${subtaskProgressPercent}%`, height: '100%', background: 'var(--color-primary)', transition: 'width 0.2s ease' }} />
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--color-text-disabled)', whiteSpace: 'nowrap' }}>
                      {completedSubtasks} of {subtasks.length} ({Math.round(subtaskProgressPercent)}%)
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(() => {
                      const userAvatarById = Object.fromEntries(users.map((u) => [u.id, u.avatar]));
                      return subtasks.map((sub) => {
                        const rowProps = {
                          ticket: sub,
                          onClick: onSelectTicket,
                          priorityIcon: getPriorityIcon(sub.priority),
                          assigneeAvatar: getAssigneeAvatar(userAvatarById, sub.assigneeId),
                        };
                        return (
                          <React.Fragment key={sub.id}>
                            <div className="ticket-list__row-desktop">
                              <TicketRow {...rowProps} />
                            </div>
                            <div className="ticket-list__row-mobile">
                              <TicketRowMobile {...rowProps} />
                            </div>
                          </React.Fragment>
                        );
                      });
                    })()}
                  </div>

                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'var(--color-text-disabled)', fontStyle: 'italic', padding: '8px 4px' }}>
                  No sub-tasks defined. Break complex tasks down to improve trackability.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {configurationEntries.length > 0 ? (
                <section className="ticket-relations">
                  <div className="ticket-relations__header">
                    <span className="ticket-relations__title">Relations</span>

                    <span className="ticket-relations__count">
                      {configurationEntries.length}
                    </span>
                  </div>

                  <div className="ticket-relations__items">
                    {configurationEntries.map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        className="ticket-configurations__line"
                        onClick={() => {
                          if (entry.resolvedTicket) {
                            onSelectTicket(entry.resolvedTicket);
                          }
                        }}
                        disabled={!entry.resolvedTicket}
                        aria-label={`${entry.key} - ${entry.title}`}
                      >
                        <span className="ticket-configurations__relation">{entry.relation}</span>

                        <span className="ticket-configurations__ticket-key">{entry.key}</span>

                        <span className="ticket-configurations__ticket-title">{entry.title}</span>

                        <span className="ticket-configurations__assignee">
                          {entry.assigneeAvatar ? (
                            <img
                              src={entry.assigneeAvatar}
                              alt=""
                              className="ticket-configurations__assignee-avatar"
                            />
                          ) : (
                            <span className="ticket-configurations__assignee-fallback" aria-hidden="true">
                              {entry.assigneeName.charAt(0).toUpperCase()}
                            </span>
                          )}
                          <span className="ticket-configurations__assignee-name">{entry.assigneeName}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
              <div style={{ borderBottom: '1px solid var(--color-border-default)', paddingBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-disabled)', textTransform: 'uppercase' }}>
                  Activity Thread ({comments.length})
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {comments.map((comment) => (
                  <div key={comment.id} id={`comment-${comment.id}`} style={{ display: 'flex', gap: '12px' }}>
                    <img
                      src={comment.userAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=guest'}
                      alt={comment.userName}
                      style={{ width: '24px', height: '24px', borderRadius: '50%', border: '1px solid var(--color-border-default)' }}
                    />

                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{comment.userName || 'Member'}</span>
                          <span style={{ fontSize: '10px', color: 'var(--color-text-disabled)' }}>
                            {new Date(comment.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        <ClickAwayListener onClickAway={closeCommentMenu} active={openMenuCommentId === comment.id}>
                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              onClick={() => setOpenMenuCommentId(openMenuCommentId === comment.id ? null : comment.id)}
                              style={{
                                background: 'none',
                                border: 'none',
                                color: openMenuCommentId === comment.id ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)',
                                cursor: 'pointer',
                                display: 'flex',
                                padding: '4px',
                                borderRadius: 'var(--radius-xs)',
                                transition: 'color var(--transition-fast), background var(--transition-fast)'
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--color-text-secondary)'; e.currentTarget.style.background = 'var(--color-base100)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.color = openMenuCommentId === comment.id ? 'var(--color-text-secondary)' : 'var(--color-text-disabled)'; e.currentTarget.style.background = 'none'; }}
                              aria-label="Comment options"
                            >
                              <MoreHorizontal size={14} />
                            </button>

                            {openMenuCommentId === comment.id && (
                              <div
                                style={{
                                  position: 'absolute',
                                  top: 'calc(100% + 4px)',
                                  right: 0,
                                  zIndex: 200,
                                  minWidth: '172px',
                                  background: 'var(--color-surface-card)',
                                  border: '1px solid var(--color-border-default)',
                                  borderRadius: 'var(--radius-sm)',
                                  boxShadow: 'var(--shadow-lg)',
                                  padding: '4px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '1px',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingCommentId(comment.id);
                                    setEditingCommentBody(comment.body);
                                    setOpenMenuCommentId(null);
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '7px 10px',
                                    background: 'none', border: 'none',
                                    borderRadius: 'var(--radius-xs)',
                                    color: 'var(--color-text-secondary)', cursor: 'pointer',
                                    textAlign: 'left', fontSize: '12px',
                                    transition: 'background var(--transition-fast)',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-base100)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                                >
                                  <Edit3 size={13} style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }} />
                                  <span>Edit Comment</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    const url = `${window.location.origin}${window.location.pathname}#comment-${comment.id}`;
                                    void copyToClipboard(url, 'Comment link copied');
                                    setOpenMenuCommentId(null);
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '7px 10px',
                                    background: 'none', border: 'none',
                                    borderRadius: 'var(--radius-xs)',
                                    color: 'var(--color-text-secondary)', cursor: 'pointer',
                                    textAlign: 'left', fontSize: '12px',
                                    transition: 'background var(--transition-fast)',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-base100)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                                >
                                  <Link size={13} style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }} />
                                  <span>Grab Link</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    void copyToClipboard(serializeRichTextMarkdown(comment.body), 'Comment copied');
                                    setOpenMenuCommentId(null);
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '7px 10px',
                                    background: 'none', border: 'none',
                                    borderRadius: 'var(--radius-xs)',
                                    color: 'var(--color-text-secondary)', cursor: 'pointer',
                                    textAlign: 'left', fontSize: '12px',
                                    transition: 'background var(--transition-fast)',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-base100)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                                >
                                  <FileText size={13} style={{ color: 'var(--color-text-disabled)', flexShrink: 0 }} />
                                  <span>Copy Markdown</span>
                                </button>

                                <div style={{ height: '1px', background: 'var(--color-border-default)', margin: '3px 6px' }} />

                                <button
                                  type="button"
                                  onClick={() => {
                                    setDeletingCommentId(comment.id);
                                    setOpenMenuCommentId(null);
                                  }}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    width: '100%', padding: '7px 10px',
                                    background: 'none', border: 'none',
                                    borderRadius: 'var(--radius-xs)',
                                    color: 'var(--color-error)', cursor: 'pointer',
                                    textAlign: 'left', fontSize: '12px',
                                    transition: 'background var(--transition-fast)',
                                  }}
                                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-error)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
                                >
                                  <Trash2 size={13} style={{ flexShrink: 0 }} />
                                  <span>Delete Comment</span>
                                </button>
                              </div>
                            )}
                          </div>
                        </ClickAwayListener>
                      </div>

                      <div
                        style={{
                          fontSize: '13px',
                          color: 'var(--color-text-secondary)',
                          background: 'var(--color-surface-card)',
                          border: '1px solid var(--color-border-default)',
                          borderRadius: '6px',
                          padding: '10px 14px',
                          lineHeight: '1.5'
                        }}
                      >
                        {editingCommentId === comment.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                            <CommentEditor
                              value={editingCommentBody}
                              onChange={setEditingCommentBody}
                              placeholder="Edit comment..."
                              autoFocus
                            />
                            <div style={{ display: 'flex', gap: '6px', alignSelf: 'flex-end' }}>
                              <Button
                                onClick={async () => {
                                  if (!isRichTextEmpty(editingCommentBody)) {
                                    await onUpdateComment(activeTicket.id, comment.id, editingCommentBody);
                                    setEditingCommentId(null);
                                  }
                                }}
                                variant="primary"
                                size="sm"
                                style={{ padding: '2px 8px', fontSize: '11px' }}
                              >
                                Save
                              </Button>
                              <Button
                                onClick={() => setEditingCommentId(null)}
                                size="sm"
                                style={{ padding: '2px 8px', fontSize: '11px' }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <MarkdownContent text={comment.body} />
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={handlePostComment} className="ticket-detail__comment-form">
                <CommentEditor
                  placeholder="Post updates, links, or mention PRs..."
                  value={commentInput}
                  onChange={setCommentInput}
                  className="ticket-detail__comment-editor"
                />
                <Button
                  type="submit"
                  variant="primary"
                >
                  <Send size={12} />
                  <span>Comment</span>
                </Button>
              </form>

            </div>

          </div>

          <div className="ticket-detail__sidebar" data-testid="desktop-sidebar">
            <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-disabled)', marginBottom: '16px' }}>
              Properties
            </div>
            {propertiesContent}
          </div>



        </div>

      </div>
      </TicketContextMenu>

      {isDeleteConfirmOpen && (
        <Portal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 950,
            }}
            className="lib-animate-fade-in"
          >
            <div
              style={{
                width: '360px',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-error)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-xl)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ background: 'var(--color-bg-error)', borderBottom: '1px solid var(--color-border-error)', padding: '16px 20px 14px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>
                  Delete {activeTicket.key}?
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-disabled)', lineHeight: '1.5' }}>
                  This removes the ticket and all its activity. This action cannot be undone.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px' }}>
                <Button onClick={() => setIsDeleteConfirmOpen(false)} size="sm">
                  Cancel
                </Button>
                <Button onClick={() => void confirmDelete()} variant="danger" size="sm">
                  Delete Ticket
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}

      {deletingCommentId && (
        <Portal>
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 950,
            }}
            className="lib-animate-fade-in"
          >
            <div
              style={{
                width: '360px',
                background: 'var(--color-surface-card)',
                border: '1px solid var(--color-border-error)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-xl)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div style={{ background: 'var(--color-bg-error)', borderBottom: '1px solid var(--color-border-error)', padding: '16px 20px 14px' }}>
                <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--color-text-primary)', display: 'block', marginBottom: '4px' }}>
                  Delete this comment?
                </span>
                <span style={{ fontSize: '12px', color: 'var(--color-text-disabled)', lineHeight: '1.5' }}>
                  This will permanently remove the comment from the activity thread.
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '14px 20px' }}>
                <Button onClick={() => setDeletingCommentId(null)} size="sm">
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    await onDeleteComment(activeTicket.id, deletingCommentId);
                    setDeletingCommentId(null);
                  }}
                  variant="danger"
                  size="sm"
                >
                  Delete Comment
                </Button>
              </div>
            </div>
          </div>
        </Portal>
      )}


    </>
  );
};
