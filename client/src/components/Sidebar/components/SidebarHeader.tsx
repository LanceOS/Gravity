import { Sparkles } from 'lucide-react';
import type { SidebarWorkspaceSection } from '../types';
import { ThemeToggle, Select } from '@library';

interface SidebarHeaderProps {
  workspace: SidebarWorkspaceSection;
  canOpenCreateTicket: boolean;
  onOpenCreateTicket: () => void;
}

export function SidebarHeader({ workspace, canOpenCreateTicket, onOpenCreateTicket }: SidebarHeaderProps) {
  return (
    <>
      <div
        style={{
          padding: '16px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="var(--text-heading)" strokeWidth="2" />
          <circle cx="12" cy="12" r="6" stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 2" />
          <circle cx="12" cy="12" r="2" fill="var(--text-heading)" />
        </svg>
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: '6px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-heading)', letterSpacing: '-0.3px' }}>Gravity</span>
            <ThemeToggle />
          </div>

          <Select
            value={workspace.activeWorkspaceId}
            onValueChange={(val: string) => workspace.onSelectWorkspace(val)}
            options={workspace.workspaces.map((item) => ({ value: item.id, label: item.name }))}
            aria-label="Select workspace"
            className="input"
            style={{ width: '100%', minHeight: '34px', padding: '0 10px', fontSize: '12px' }}
          />
        </div>
      </div>

      {canOpenCreateTicket ? (
        <div style={{ padding: '12px 16px 8px 16px' }}>
          <button
            type="button"
            onClick={onOpenCreateTicket}
            className="btn btn-primary clickable"
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px' }}
          >
            <Sparkles size={14} />
            <span>New Ticket</span>
            <span style={{ fontSize: '10px', opacity: 0.6, marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', padding: '1px 5px', borderRadius: '3px' }}>N</span>
          </button>
        </div>
      ) : null}
    </>
  );
}