import React, { useCallback, useMemo } from 'react';
import type { Ticket } from '../../../../../context/TicketContextContext';
import type { TicketWithRelations } from '../../../utils/ticketRelations';
import type { User, Project, Cycle, Label } from '../../../../../types/domain';
import {
  Select,
  Popover,
} from '@library';
import { GitPullRequest, GitMerge, Plus } from 'lucide-react';
import TicketUtilities from '../../TicketUtilities/TicketUtilities';
import { LabelBadge } from '../../LabelBadge';
import { SearchableOptionPickerPopoverContent } from '../../SearchableOptionPickerPopoverContent';
import { TicketRelationsSection } from '../TicketRelationsSection';
import { useLabels } from '../../../../../context/label/LabelContext';
import { PRIORITY_OPTIONS, STATUS_OPTIONS } from '../../../utils/TicketDetail';

interface TicketPropertiesGridProps {
  activeTicket: Ticket;
  activeTicketDetail?: TicketWithRelations | null;
  availableTickets: Ticket[];
  ticketsById?: Map<string, Ticket>;
  parentTicket: Ticket | null;
  users: User[];
  projects: Project[];
  labels: Label[];
  cycles: Cycle[];
  ticketLink: string;
  generatedBranchName: string;
  onSelectTicket: (ticket: Ticket | null) => void;
  onUpdateTicket: (id: string, updates: Partial<Ticket>) => void;
  onAddDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  onRemoveDependency: (ticketId: string, dependencyId: string) => Promise<boolean>;
  onAddBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  onRemoveBlocker: (ticketId: string, blockerId: string) => Promise<boolean>;
  copyToClipboard: (value: string, successMessage?: string) => Promise<void>;
  onSelectLabel?: (projectId: string, labelId: string) => void;
}

export const TicketPropertiesGrid: React.FC<TicketPropertiesGridProps> = ({
  activeTicket,
  activeTicketDetail,
  availableTickets,
  ticketsById,
  parentTicket,
  users,
  projects,
  labels,
  cycles,
  ticketLink,
  generatedBranchName,
  onSelectTicket,
  onUpdateTicket,
  onAddDependency,
  onRemoveDependency,
  onAddBlocker,
  onRemoveBlocker,
  copyToClipboard,
  onSelectLabel,
}) => {
  const { assignLabelToTicket, unassignLabelFromTicket, createLabel: createLabelInContext } = useLabels();

  const handleAssignLabel = useCallback(async (labelId: string) => {
    await assignLabelToTicket(activeTicket.id, labelId);
  }, [assignLabelToTicket, activeTicket.id]);

  const handleUnassignLabel = useCallback(async (labelId: string) => {
    await unassignLabelFromTicket(activeTicket.id, labelId);
  }, [unassignLabelFromTicket, activeTicket.id]);

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

  const renderAddRelationTrigger = (buttonLabel: string) => (
    <button
      type="button"
      className="ticket-detail__inline-trigger"
    >
      <Plus size={10} />
      <span>{buttonLabel}</span>
    </button>
  );

  const assigneeOptions = [{ value: '', label: 'Unassigned' }, ...users.map((user) => ({ value: user.id, label: user.name }))];
  const projectOptions = projects.map((project) => ({ value: project.id, label: project.name }));
  const cycleOptions = [{ value: '', label: 'No Cycle' }, ...cycles.map((cycle) => ({ value: cycle.id, label: cycle.name }))];

  return (
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
                interactive={!!onSelectLabel}
                onClick={onSelectLabel ? () => onSelectLabel(activeTicket.projectId, l.id) : undefined}
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

      <TicketRelationsSection
        activeTicket={activeTicket}
        activeTicketDetail={activeTicketDetail ?? null}
        availableTickets={availableTickets}
        ticketsById={ticketsById}
        parentTicket={parentTicket}
        users={users}
        onSelectTicket={onSelectTicket}
        onAddDependency={onAddDependency}
        onRemoveDependency={onRemoveDependency}
        onAddBlocker={onAddBlocker}
        onRemoveBlocker={onRemoveBlocker}
      />

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
};
