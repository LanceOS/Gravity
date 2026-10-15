import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Label, Project, Ticket, User } from '../../../types/domain';
import { apiClient } from '../../../utils/apiClient';
import './BulkTicketTriage.css';

type ActionType = 'status' | 'priority' | 'assignee' | 'add_label' | 'remove_label';
type BulkResult = { id: string; success: boolean; ticket?: Ticket; error?: string };

interface Props {
  workspaceId?: string;
  visibleTickets: Ticket[];
  selectedTickets: Ticket[];
  projects: Project[];
  users: User[];
  labels: Label[];
  onSelectVisible: () => void;
  onClear: () => void;
}

const statuses: Ticket['status'][] = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled'];
const priorities: Ticket['priority'][] = ['no_priority', 'low', 'medium', 'high', 'urgent'];

export function BulkTicketTriage({ workspaceId, visibleTickets, selectedTickets, projects, users, labels, onSelectVisible, onClear }: Props) {
  const queryClient = useQueryClient();
  const [actionType, setActionType] = useState<ActionType>('status');
  const [value, setValue] = useState('');
  const [pending, setPending] = useState(false);
  const [results, setResults] = useState<BulkResult[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const projectById = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects]);
  const ticketById = useMemo(() => new Map(selectedTickets.map((ticket) => [ticket.id, ticket])), [selectedTickets]);
  const options = actionType === 'status' ? statuses.map((status) => ({ value: status, label: status.replaceAll('_', ' ') }))
    : actionType === 'priority' ? priorities.map((priority) => ({ value: priority, label: priority.replaceAll('_', ' ') }))
      : actionType === 'assignee' ? [{ value: '__unassigned__', label: 'Unassigned' }, ...users.map((user) => ({ value: user.id, label: user.name }))]
        : labels.map((label) => ({ value: label.id, label: label.name }));
  const selectedValue = options.some((option) => option.value === value) ? value : '';
  const selectedLabel = actionType === 'add_label' || actionType === 'remove_label'
    ? labels.find((label) => label.id === selectedValue) : undefined;
  const labelCompatible = (ticket: Ticket) => !selectedLabel || (selectedLabel.projectId
    ? selectedLabel.projectId === ticket.projectId
    : !!selectedLabel.teamId && selectedLabel.teamId === projectById.get(ticket.projectId)?.teamId);
  const incompatibleCount = (actionType === 'add_label' || actionType === 'remove_label') && selectedLabel
    ? selectedTickets.filter((ticket) => !labelCompatible(ticket)).length : 0;
  const canSubmit = !!workspaceId && selectedTickets.length > 0 && selectedTickets.length <= 100 && !!selectedValue && !pending;

  const apply = async () => {
    if (!canSubmit || !workspaceId) return;
    setPending(true);
    setResults([]);
    setRequestError(null);
    try {
      const response = await apiClient.post<{ results: BulkResult[] }>('/tickets/bulk-triage', {
        workspaceId,
        tickets: selectedTickets.map((ticket) => ({ id: ticket.id, projectId: ticket.projectId, updatedAt: ticket.updatedAt })),
        action: { type: actionType, value: actionType === 'assignee' && selectedValue === '__unassigned__' ? null : selectedValue },
      });
      setResults(response.results);
    } catch (error) {
      setRequestError(error instanceof Error ? `${error.message} Refresh before retrying; some changes may have completed.` : 'Bulk result unavailable. Refresh before retrying.');
    } finally {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ['tickets'] }),
        queryClient.invalidateQueries({ queryKey: ['ticket-detail'] }),
        queryClient.invalidateQueries({ queryKey: ['workspaceTickets'] }),
        queryClient.invalidateQueries({ queryKey: ['teamTickets'] }),
        queryClient.invalidateQueries({ queryKey: ['ticketByKey'] }),
      ]);
      setPending(false);
    }
  };

  return <section aria-label="Bulk ticket triage" className="bulk-ticket-triage">
    <div className="bulk-ticket-triage__controls">
      <span role="status">{selectedTickets.length} selected</span>
      <button type="button" onClick={onSelectVisible} disabled={visibleTickets.length === 0 || pending}>Select visible ({Math.min(visibleTickets.length, 100)})</button>
      <button type="button" onClick={() => { onClear(); setResults([]); setRequestError(null); }} disabled={selectedTickets.length === 0 || pending}>Clear selection</button>
      {selectedTickets.length > 0 && <>
        <label>Action <select aria-label="Bulk action" value={actionType} disabled={pending} onChange={(event) => { setActionType(event.target.value as ActionType); setValue(''); setResults([]); setRequestError(null); }}>
          <option value="status">Status</option><option value="priority">Priority</option><option value="assignee">Assignee</option>
          <option value="add_label">Add label</option><option value="remove_label">Remove label</option>
        </select></label>
        <label>Value <select aria-label="Bulk action value" value={selectedValue} disabled={pending} onChange={(event) => setValue(event.target.value)}>
          <option value="">Choose…</option>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <button type="button" onClick={apply} disabled={!canSubmit}>{pending ? 'Applying…' : 'Apply to selected'}</button>
      </>}
    </div>
    {selectedTickets.length > 0 && <div className="bulk-ticket-triage__preview">
      <strong>Preview: {selectedTickets.length} tickets</strong>
      {selectedTickets.length === 100 && visibleTickets.length > 100 && <p>Selection is limited to 100 tickets. Apply or clear before selecting more.</p>}
      {actionType === 'assignee' && new Set(selectedTickets.map((ticket) => ticket.projectId)).size > 1 &&
        <p>Projects may have different eligible assignees. Each ticket is checked before it changes.</p>}
      {incompatibleCount > 0 && <p>{incompatibleCount} tickets cannot use this label in their project or team; those tickets will fail individually.</p>}
      <ul>{selectedTickets.map((ticket) => <li key={ticket.id}>
        {ticket.key}: {ticket.title} <span>({projectById.get(ticket.projectId)?.name ?? 'Unknown project'})</span>
        {!labelCompatible(ticket) && <span> — incompatible label</span>}
      </li>)}</ul>
    </div>}
    {results.length > 0 && <div role="status" className="bulk-ticket-triage__results">
      <strong>{results.filter((result) => result.success).length} succeeded; {results.filter((result) => !result.success).length} failed</strong>
      <ul>{results.map((result) => <li key={result.id}>{result.ticket?.key ?? ticketById.get(result.id)?.key ?? result.id}: {result.success ? 'Updated' : result.error ?? 'Failed'}</li>)}</ul>
    </div>}
    {requestError && <p role="alert">{requestError}</p>}
  </section>;
}
