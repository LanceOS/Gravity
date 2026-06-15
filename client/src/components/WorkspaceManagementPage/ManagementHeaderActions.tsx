import { ArrowLeft, Sparkles } from 'lucide-react';
import { Button } from '@library';

export interface WorkspaceManagementHeaderActionsProps {
  classNamePrefix: string;
  onBack: () => void;
  backLabel: string;
  onCreate: () => void;
  createLabel: string;
  canCreate?: boolean;
}

export function WorkspaceManagementHeaderActions({
  classNamePrefix,
  onBack,
  backLabel,
  onCreate,
  createLabel,
  canCreate = true,
}: WorkspaceManagementHeaderActionsProps) {
  return (
    <div className={`${classNamePrefix}__actions`}>
      <Button type="button" variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft size={14} />
        <span>{backLabel}</span>
      </Button>
      <Button type="button" variant="primary" size="sm" onClick={onCreate} disabled={!canCreate}>
        <Sparkles size={14} />
        <span>{createLabel}</span>
      </Button>
    </div>
  );
}
