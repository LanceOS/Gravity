import {
  WorkspaceProjectLabelCreateForm,
  type WorkspaceProjectLabelCreateFormProps,
} from './WorkspaceProjectLabelCreateForm';
import {
  WorkspaceProjectLabelEditorSection,
  type WorkspaceProjectLabelEditorSectionProps,
} from './WorkspaceProjectLabelEditorSection';
import {
  WorkspaceProjectLabelList,
  type WorkspaceProjectLabelListProps,
} from './WorkspaceProjectLabelList';
import { WorkspaceProjectLabelSectionErrors } from './WorkspaceProjectLabelSectionErrors';
import { WorkspaceProjectLabelSectionHeader } from './WorkspaceProjectLabelSectionHeader';

interface WorkspaceProjectLabelsSectionSections {
  list: WorkspaceProjectLabelListProps;
  editor: WorkspaceProjectLabelEditorSectionProps;
  create: WorkspaceProjectLabelCreateFormProps;
}

export interface WorkspaceProjectLabelsSectionProps {
  managedProjectName: string;
  labelFormError: string | null;
  labelCreateError: string | null;
  sections: WorkspaceProjectLabelsSectionSections;
}

export function WorkspaceProjectLabelsSection({
  managedProjectName,
  labelFormError,
  labelCreateError,
  sections,
}: WorkspaceProjectLabelsSectionProps) {
  return (
    <section className="workspace-page__project-domains">
      <WorkspaceProjectLabelSectionHeader managedProjectName={managedProjectName} />
      <WorkspaceProjectLabelSectionErrors labelFormError={labelFormError} labelCreateError={labelCreateError} />
      <WorkspaceProjectLabelList {...sections.list} />
      <WorkspaceProjectLabelEditorSection {...sections.editor} />
      <WorkspaceProjectLabelCreateForm {...sections.create} />
    </section>
  );
}

