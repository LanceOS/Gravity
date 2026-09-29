import './GithubReconciliation.css';
import { useRef, useState } from 'react';
import { Button, TextInput } from '@library';
import { applyGithubReconciliation, previewGithubReconciliation, type ReconciliationPreview, type ReconciliationResult } from '../../../services/githubReconciliation';

/** Mount with a project/repository key so previews and credentials never follow project selection. */
export function GithubReconciliation({ projectId, workspaceId }: { projectId: string; workspaceId?: string | null }) {
  const [credential, setCredential] = useState('');
  const [startPage, setStartPage] = useState(1);
  const [maxPages, setMaxPages] = useState(5);
  const [preview, setPreview] = useState<ReconciliationPreview | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<ReconciliationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const pending = useRef(false);
  const scan = async (page = startPage) => {
    if (pending.current) return;
    pending.current = true; setBusy(true); setFeedback(''); setPreview(null); setResults(null); setSelected({}); setReviewed({});
    setStartPage(page);
    try { setPreview(await previewGithubReconciliation(projectId, page, maxPages, credential)); }
    catch (error) { setFeedback(error instanceof Error ? error.message : 'Preview failed.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const apply = async () => {
    if (!preview || pending.current) return;
    pending.current = true; setBusy(true); setFeedback('');
    try {
      setResults(await applyGithubReconciliation(projectId, preview.previewToken,
        preview.candidates.filter(candidate => selected[candidate.id]).map(candidate => ({ candidateId: candidate.id, reviewed: !!reviewed[candidate.id] })), credential));
      setSelected({});
      setPreview(null);
      setCredential('');
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'Apply failed.'); }
    finally { pending.current = false; setBusy(false); }
  };
  const count = Object.values(selected).filter(Boolean).length;
  return (
    <section className="github-reconciliation" aria-label="GitHub reconciliation" style={{ display: 'grid', gap: 12, marginTop: 24 }}>
      <h3>Recover missed PR updates</h3>
      <p>Preview merged pull requests before updating tickets. Newer ticket edits, canceled tickets, reopened work, and existing links to other PRs are preserved. Project owners and workspace admins can apply changes.</p>
      <TextInput label="Read-only GitHub token (optional for public repositories)" type="password" autoComplete="off"
        value={credential} disabled={busy} onChange={event => setCredential(event.target.value)} />
      <p>For private repositories, use a fine-grained token limited to this repository with Pull requests: read, or a read-only installation token. It is used for this request and is not saved.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <TextInput label="Start page" type="number" min={1} max={1000} value={startPage} disabled={busy}
          onChange={event => { setStartPage(Number(event.target.value)); setPreview(null); setSelected({}); }} />
        <TextInput label="Pages to scan (100 PRs each)" type="number" min={1} max={5} value={maxPages} disabled={busy}
          onChange={event => { setMaxPages(Number(event.target.value)); setPreview(null); setSelected({}); }} />
      </div>
      <Button type="button" disabled={busy} onClick={() => void scan()}>Preview GitHub updates</Button>
      {busy && <p role="status">Checking GitHub…</p>}
      {feedback && <p role="alert">{feedback}</p>}
      {results && <div role="status"><h4>Reconciliation results</h4><ul>{results.results.map(result => (
        <li key={result.candidateId}>{result.ticketKey} / PR #{result.prNumber}: {result.outcome}{result.reason ? ` — ${result.reason}` : ''}</li>
      ))}</ul><p>Run another preview to refresh the remaining work.</p></div>}
      {preview && <>
        <p>{preview.pullCount} PRs scanned in {preview.repository}. Preview expires at {new Date(preview.expiresAt).toLocaleTimeString()}.</p>
        {preview.incomplete && <p role="status">This is a partial scan. Other matching PRs may exist; each choice requires individual review.</p>}
        {preview.candidates.length === 0 && <p>No ticket matches in these pages.</p>}
        <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', textAlign: 'left' }}>
          <thead><tr><th>Ticket / PR</th><th>Evidence</th><th>Proposed changes</th><th>Review and select</th></tr></thead>
          <tbody>{preview.candidates.map(candidate => <tr key={candidate.id}>
            <td><strong>{workspaceId ? <a href={`/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}/tickets/${encodeURIComponent(candidate.ticketKey)}`} target="_blank" rel="noreferrer">{candidate.ticketKey}</a> : candidate.ticketKey}</strong> {candidate.ticketTitle}<br />
              <a href={candidate.pull.url} target="_blank" rel="noreferrer">PR #{candidate.pull.number}: {candidate.pull.title}</a><br />
              {candidate.pull.mergedAt ? `Merged ${new Date(candidate.pull.mergedAt).toLocaleString()}` : 'Not merged'}
            </td>
            <td>{candidate.confidence === 'explicit' ? 'Explicit match' : 'Suggested match'}<ul>{candidate.evidence.map(item => <li key={item}>{item}</li>)}</ul></td>
            <td>{candidate.noChange ? 'Already synchronized' : candidate.protected ? 'No change — protected' : <>
              Status: {candidate.current.status} → {candidate.proposed.status}<br />
              PR status: {candidate.current.prStatus} → {candidate.proposed.prStatus}<br />
              PR link: {candidate.current.prUrl || 'none'} → #{candidate.pull.number}
            </>}</td>
            <td><ul>{candidate.conflicts.map(item => <li key={item}>{item}</li>)}</ul>
              {candidate.protected ? <span>Preserved — no change</span> : !candidate.noChange && <>
                {candidate.requiresReview && <label><input type="checkbox" checked={!!reviewed[candidate.id]} disabled={busy}
                  onChange={event => { setReviewed(value => ({ ...value, [candidate.id]: event.target.checked })); setSelected(value => ({ ...value, [candidate.id]: false })); }} />
                  I reviewed {candidate.ticketKey} with PR #{candidate.pull.number}</label>}
                <label><input type="checkbox" aria-label={`Select ${candidate.ticketKey} PR #${candidate.pull.number}`}
                  disabled={busy || (candidate.requiresReview && !reviewed[candidate.id])} checked={!!selected[candidate.id]}
                  onChange={event => setSelected(value => {
                    const next = { ...value };
                    for (const other of preview.candidates.filter(item => item.ticketId === candidate.ticketId)) next[other.id] = false;
                    next[candidate.id] = event.target.checked;
                    return next;
                  })} />Apply this match</label>
              </>}
            </td>
          </tr>)}</tbody>
        </table></div>
        <p>Apply updates only the selected matches. Title suggestions and ambiguous matches require individual review.</p>
        <Button type="button" variant="primary" disabled={busy || count === 0 || count > 100} onClick={() => void apply()}>Apply {count} selected {count === 1 ? 'match' : 'matches'}</Button>
        {count > 100 && <p>Select at most 100 matches per apply.</p>}
        {preview.nextPage && <Button type="button" disabled={busy} onClick={() => void scan(preview.nextPage!)}>Preview next pages</Button>}
      </>}
    </section>
  );
}
