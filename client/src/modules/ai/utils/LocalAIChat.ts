import type { AttachedTicketContext, Message, QuickActionContext, QuickActionType } from '../types/LocalAIChat';

export function getInitialOllamaUrl(initialOllamaUrl: string) {
  return initialOllamaUrl || 'http://localhost:11434';
}

export function getInitialModel(initialModel: string) {
  return initialModel || '';
}

export function getInitialMessages(): Message[] {
  return [];
}

export function buildQuickActionPrompt(actionType: QuickActionType, context: QuickActionContext) {
  const { activeTicket, projects, users } = context;
  const assigneeName = activeTicket.assigneeId ? users.find((user) => user.id === activeTicket.assigneeId)?.name : 'Unassigned';
  const projectName = projects.find((project) => project.id === activeTicket.projectId)?.name || 'General';

  if (actionType === 'analyze') {
    return `Review this ticket context:\nKey: ${activeTicket.key}\nTitle: ${activeTicket.title}\nDescription: ${activeTicket.description || 'No description'}\nAssignee: ${assigneeName}\nProject: ${projectName}\nStatus: ${activeTicket.status}\nPriority: ${activeTicket.priority}\n\nTask: Provide a detailed architectural analysis of this ticket, identify any immediate design patterns that should be applied, mention any potential code decoupling points, and list any risks or dependencies. Keep it concise.`;
  }

  if (actionType === 'subtasks') {
    return `Review this ticket context:\nKey: ${activeTicket.key}\nTitle: ${activeTicket.title}\nDescription: ${activeTicket.description || 'No description'}\n\nTask: Generate an action-oriented technical checklist of 3-5 sub-tasks. Present them in standard markdown bullet points. Under each bullet point, write a 1-sentence engineering instruction.`;
  }

  return `Review this ticket context:\nKey: ${activeTicket.key}\nTitle: ${activeTicket.title}\nDescription: ${activeTicket.description || 'No description'}\nProject: ${projectName}\nPR status: ${activeTicket.prStatus}\n\nTask: Write a professional, punchy Release Note for this ticket as if it were being shipped to production. Summarize what it changes, and why it benefits developers or users.`;
}

const MAX_TICKET_DESCRIPTION_LENGTH = 1200;

function humanizeValue(value: string | null | undefined) {
  if (!value) {
    return 'None';
  }

  return value.replace(/_/g, ' ');
}

function truncateContextText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildAttachedTicketModelContext({ tickets, projects, users }: AttachedTicketContext) {
  if (tickets.length === 0) {
    return '';
  }

  const projectById = new Map(projects.map((project) => [project.id, project]));
  const userById = new Map(users.map((user) => [user.id, user]));

  const ticketBlocks = tickets.map((ticket, index) => {
    const project = projectById.get(ticket.projectId);
    const assignee = ticket.assigneeId ? userById.get(ticket.assigneeId) : undefined;
    const labels = ticket.labels?.map((label) => label.name).filter(Boolean).join(', ') || 'None';
    const dependencies = ticket.dependencies?.map((dependency) => `${dependency.key}: ${dependency.title}`).join('; ') || 'None';
    const blockers = ticket.blockers?.map((blocker) => `${blocker.key}: ${blocker.title}`).join('; ') || 'None';
    const description = ticket.description
      ? truncateContextText(ticket.description, MAX_TICKET_DESCRIPTION_LENGTH)
      : 'No description provided.';

    return [
      `${index + 1}. ${ticket.key}: ${ticket.title}`,
      `Project: ${project ? `${project.name} (${project.key})` : ticket.projectId}`,
      `Status: ${humanizeValue(ticket.status)}`,
      `Priority: ${humanizeValue(ticket.priority)}`,
      `Assignee: ${assignee?.name || 'Unassigned'}`,
      `Labels: ${labels}`,
      `Dependencies: ${dependencies}`,
      `Blockers: ${blockers}`,
      `Description: ${description}`,
    ].join('\n');
  });

  return [
    'Attached ticket context for this message. Use it as supporting context for the user request.',
    ...ticketBlocks,
  ].join('\n\n');
}

export function buildOllamaErrorMessage(model: string, ollamaUrl: string, errorMessage: string): Message {
  return {
    role: 'system',
    content: `❌ **Failed to contact local Ollama**\n\n* **Error details**: ${errorMessage}\n* **Troubleshooting**:\n  1. Verify Ollama is running in your terminal (\`ollama serve\` or check your desktop application).\n  2. Check if model \`${model}\` is installed. Run \`ollama pull ${model}\` to download it.\n  3. Verify the Ollama API port is open on \`${ollamaUrl}\`.`,
  };
}
