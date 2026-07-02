import { and, asc, eq } from 'drizzle-orm';
import { db } from '../../../db/index.js';
import { chatMessages, chatSessions, projects, workspaces } from '../../../db/schema.js';
import { env } from '../../../env.js';
import { createId, getUserSettingsRecord } from '../../../lib/platform.js';
import { validateOllamaUrl } from '../../ai/utils/utils.js';
import { Message, Message as AiMessage } from '../../ai/types.js';
import { systemPrompt } from '../../ai/config/sysPrompt.js';
import { aiService } from '../../ai/index.js';
import { executeTool as defaultExecuteTool } from '../../mcp/tool-executor.js';
import { getDisabledTools } from '../../mcp/workspace-tools.js';
import { mcpToolsList } from '../../mcp/tools.js';
import type { McpToolDefinition } from '../../mcp/types.js';

type ChatProvider = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'ollama';

type AiClient = {
  chat(
    userId: string,
    provider: string,
    options: {
      model: string;
      messages: Message[];
      tools?: any[];
      ollamaUrl?: string;
      maxTokens?: number;
    },
  ): Promise<{ content: string; toolCalls?: any[] }>;
};

type ExecuteToolFn = (
  name: string,
  args: Record<string, unknown>,
  contextWorkspaceId: string,
  actorUserId: string,
) => Promise<unknown>;

type ChatGenerationInput = {
  projectId: string;
  chatId: string;
  userId: string;
  message?: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  onChunk?: (chunk: string) => Promise<void> | void;
};

type ChatGenerationResult = {
  assistantMessageId: string;
  content: string;
  provider: string;
  model: string;
  toolCalls?: any[];
  fallback: boolean;
  fallbackReason?: string;
};

type ProjectContext = {
  session: {
    id: string;
    projectId: string;
    userId: string;
    title: string;
  };
  project: {
    id: string;
    name: string;
    key: string;
    description: string | null;
    workspaceId: string;
  };
  workspace: {
    id: string;
    name: string;
    description: string;
  };
};

const SUPPORTED_PROVIDERS = new Set<ChatProvider>(['openai', 'anthropic', 'gemini', 'deepseek', 'ollama']);

const DEFAULT_MODELS: Record<ChatProvider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku',
  gemini: 'gemini-1.5-flash',
  deepseek: 'deepseek-chat',
  ollama: 'llama3.1',
};

const TOOL_ALIAS_BLOCKS: string[][] = [
  ['add_comment', 'create_comment'],
  ['add_dependency', 'add_ticket_dependency', 'mark_ticket_blocked'],
  ['remove_dependency', 'remove_ticket_dependency', 'unmark_ticket_blocked'],
];

const CHAT_TITLE_DEFAULT = 'New Chat';
const CHAT_TITLE_MAX_LENGTH = 60;
const MAX_TOOL_ROUNDS = 2;

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isToolDisabled(name: string, disabledTools: string[]) {
  const aliasGroup = TOOL_ALIAS_BLOCKS.find((group) => group.includes(name));
  if (aliasGroup) {
    return aliasGroup.some((alias) => disabledTools.includes(alias));
  }

  return disabledTools.includes(name);
}

function safeStringify(value: unknown) {
  if (value === undefined) {
    return 'No output.';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return true;
  }

  const message = error instanceof Error ? error.message : '';
  return /timeout|timed.?out|aborted|abort/i.test(message);
}

function isTokenLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : '';
  return /token|context|limit|too many/i.test(message);
}

export class ChatService {
  private readonly ai: AiClient;
  private readonly executeToolFn: ExecuteToolFn;

  constructor(dependencies?: { ai?: AiClient; executeTool?: ExecuteToolFn }) {
    this.ai = dependencies?.ai ?? aiService;
    this.executeToolFn = dependencies?.executeTool ?? defaultExecuteTool;
  }

  async generateResponse(input: ChatGenerationInput): Promise<ChatGenerationResult> {
    const context = await this.loadContext(input.projectId, input.chatId, input.userId);
    const settings = await getUserSettingsRecord(input.userId);

    const resolvedProvider = this.resolveProvider(input.provider, settings.aiProvider);
    const resolvedModel = this.resolveModel(resolvedProvider, input.model, settings);

    const requestOllamaUrl = resolvedProvider === 'ollama' ? settings.ollamaEndpoint : undefined;
    if (requestOllamaUrl) {
      validateOllamaUrl(requestOllamaUrl);
    }

    const priorRows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, input.chatId))
      .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id));

    const userMessageText = normalizeString(input.message);
    const conversationRows = [...priorRows];
    let insertedUserMessage = null;
    let isFirstUserMessage = false;

    if (userMessageText.length > 0) {
      const hasUserMessage = conversationRows.some((row) => row.role === 'user');
      isFirstUserMessage = !hasUserMessage;

      insertedUserMessage = await this.appendMessage(input.chatId, 'user', userMessageText, {
        source: 'chat-client',
        provider: resolvedProvider,
      });
      conversationRows.push(insertedUserMessage);

      await db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, input.chatId));
    } else {
      const hasExistingUserMessage = conversationRows.some((row) => row.role === 'user');
      if (!hasExistingUserMessage) {
        throw new Error('No user message provided for this chat turn.');
      }
    }

    const activeTools = await this.loadActiveTools(context.project.workspaceId);
    const activeToolDefs = activeTools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));

    const conversation: Message[] = [
      {
        role: 'system',
        content: this.buildSystemPrompt(context, activeTools),
      },
      ...conversationRows.map((row) => ({
        role: row.role,
        content: row.content,
      } as Message)),
    ];

    const modelResult = await this.generateWithToolLoop({
      userId: input.userId,
      chatId: input.chatId,
      workspaceId: context.project.workspaceId,
      provider: resolvedProvider,
      model: resolvedModel,
      ollamaUrl: requestOllamaUrl,
      maxTokens: input.maxTokens,
      messages: conversation,
      toolDefinitions: activeToolDefs,
    });

    if (input.onChunk) {
      const chunkSize = Math.max(1, env.aiStreamChunkSize ?? 48);
      for (let i = 0; i < modelResult.content.length; i += chunkSize) {
        await input.onChunk(modelResult.content.slice(i, i + chunkSize));
      }
    }

    const assistant = await this.appendMessage(input.chatId, 'assistant', modelResult.content, {
      source: 'ai',
      provider: resolvedProvider,
      model: resolvedModel,
      fallback: modelResult.fallback,
      fallbackReason: modelResult.fallbackReason,
      toolCalls: modelResult.toolCalls ?? null,
    });

    if (
      isFirstUserMessage &&
      userMessageText.length > 0 &&
      context.session.title === CHAT_TITLE_DEFAULT &&
      context.project.id.length > 0
    ) {
      this.enqueueTitleGeneration({
        chatId: input.chatId,
        userId: input.userId,
        workspaceId: context.project.workspaceId,
        projectName: context.project.name,
        projectKey: context.project.key,
        message: userMessageText,
        provider: resolvedProvider,
        model: resolvedModel,
        ollamaUrl: requestOllamaUrl,
      }).catch((error) => {
        console.error('Chat title generation failed:', error);
      });
    }

    return {
      assistantMessageId: assistant.id,
      content: modelResult.content,
      provider: resolvedProvider,
      model: resolvedModel,
      toolCalls: modelResult.toolCalls,
      fallback: modelResult.fallback,
      fallbackReason: modelResult.fallbackReason,
    };
  }

  private resolveProvider(requested: string | undefined, accountProvider: string) {
    const requestedProvider = normalizeString(requested).toLowerCase();
    const preferred = normalizeString(accountProvider).toLowerCase();
    const configured = normalizeString(env.aiDefaultProvider).toLowerCase();

    const candidate = requestedProvider || preferred || configured;
    if (SUPPORTED_PROVIDERS.has(candidate as ChatProvider)) {
      return candidate as ChatProvider;
    }

    if (SUPPORTED_PROVIDERS.has(configured as ChatProvider)) {
      return configured as ChatProvider;
    }

    return 'openai';
  }

  private resolveModel(
    provider: ChatProvider,
    requestedModel: string | undefined,
    settings: Awaited<ReturnType<typeof getUserSettingsRecord>>,
  ) {
    const requested = normalizeString(requestedModel);
    if (requested.length > 0) {
      return requested;
    }

    if (provider === 'ollama' && settings.preferredOllamaModel?.trim()) {
      return settings.preferredOllamaModel.trim();
    }

    if (normalizeString(env.aiDefaultModel).length > 0) {
      return env.aiDefaultModel;
    }

    return DEFAULT_MODELS[provider];
  }

  private async loadContext(projectId: string, chatId: string, userId: string): Promise<ProjectContext> {
    const sessionRows = await db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.id, chatId), eq(chatSessions.projectId, projectId), eq(chatSessions.userId, userId)))
      .limit(1);

    const session = sessionRows[0];
    if (!session) {
      throw new Error('Chat session not found.');
    }

    const projectRows = await db
      .select({
        id: projects.id,
        name: projects.name,
        key: projects.key,
        description: projects.description,
        workspaceId: projects.workspaceId,
        workspaceName: workspaces.name,
        workspaceDescription: workspaces.description,
      })
      .from(projects)
      .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
      .where(eq(projects.id, projectId))
      .limit(1);

    const project = projectRows[0];
    if (!project) {
      throw new Error('Project not found.');
    }

    return {
      session: {
        id: session.id,
        projectId: session.projectId,
        userId: session.userId,
        title: session.title,
      },
      project: {
        id: project.id,
        name: project.name,
        key: project.key,
        description: project.description,
        workspaceId: project.workspaceId,
      },
      workspace: {
        id: project.workspaceId,
        name: project.workspaceName,
        description: project.workspaceDescription,
      },
    };
  }

  private async loadActiveTools(workspaceId: string): Promise<McpToolDefinition[]> {
    const disabledTools = await getDisabledTools(workspaceId);
    return mcpToolsList.filter((tool) => !isToolDisabled(tool.name, disabledTools));
  }

  private buildSystemPrompt(context: ProjectContext, activeTools: McpToolDefinition[]) {
    const toolList =
      activeTools.length === 0
        ? 'No MCP tools are currently enabled for this workspace.'
        : activeTools
            .map((tool) => `- ${tool.name}: ${tool.description}`)
            .join('\n');

    return [
      systemPrompt,
      `\n\nContext for the active workspace/project:`,
      `Workspace: ${context.workspace.name} (${context.workspace.id})`,
      `Project: ${context.project.name} (${context.project.key})`,
      `Project description: ${context.project.description ?? 'N/A'}`,
      `Workspace description: ${context.workspace.description || 'N/A'}`,
      `
Only operate in the workspace/project above.`,
      `\n\nMCP tool list:\n${toolList}`,
      '\n\nInstructions for MCP use:',
      '1) Use MCP tools when actions require creating/updating/fetching project state.',
      '2) Call one or more tools first when they can satisfy the request, then respond with a final user-facing answer.',
      '3) Never return tool-call payloads directly to users.',
    ].join('\n');
  }

  private async generateWithToolLoop(params: {
    userId: string;
    chatId: string;
    workspaceId: string;
    provider: ChatProvider;
    model: string;
    ollamaUrl?: string;
    maxTokens?: number;
    messages: AiMessage[];
    toolDefinitions: any[];
  }) {
    let messages: Message[] = [...params.messages];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      try {
        const modelResponse = await this.ai.chat(params.userId, params.provider, {
          model: params.model,
          messages,
          tools: params.toolDefinitions,
          ...(params.ollamaUrl ? { ollamaUrl: params.ollamaUrl } : {}),
          ...(typeof params.maxTokens === 'number' ? { maxTokens: params.maxTokens } : {}),
        });

        if (!modelResponse.toolCalls || modelResponse.toolCalls.length === 0) {
          return {
            content: modelResponse.content || '',
            toolCalls: modelResponse.toolCalls,
            fallback: false,
            fallbackReason: undefined,
          };
        }

        for (const toolCall of modelResponse.toolCalls) {
          const args = this.normalizeToolArgs(toolCall.arguments);
          const toolOutput = await this.safeExecuteTool(params.userId, params.workspaceId, {
            id: toolCall.id,
            name: toolCall.name,
            arguments: args,
          });

          messages = [
            ...messages,
            {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  id: toolCall.id,
                  name: toolCall.name,
                  arguments: args,
                },
              ],
            },
            {
              role: 'tool',
              content: safeStringify(toolOutput.result),
              tool_call_id: toolCall.id,
            },
          ];

          await this.appendMessage(params.chatId, 'system', `Tool output (${toolCall.name}): ${safeStringify(toolOutput.result)}`, {
            source: 'tool',
            toolCall,
          });
        }

        continue;
      } catch (error) {
        return {
          content: this.toFallbackContent(error),
          toolCalls: undefined,
          fallback: true,
          fallbackReason: this.toFallbackReason(error),
        };
      }
    }

    return {
      content: 'I need one more step to answer this request, but I reached the tool call limit.',
      toolCalls: undefined,
      fallback: true,
      fallbackReason: 'tool_loop_limit',
    };
  }

  private async safeExecuteTool(
    userId: string,
    workspaceId: string,
    call: { id: string; name: string; arguments: unknown },
  ) {
    try {
      const args = this.normalizeToolArgs(call.arguments);
      const result = await this.executeToolFn(call.name, args as Record<string, unknown>, workspaceId, userId);
      return {
        toolCallId: call.id,
        toolName: call.name,
        args,
        result,
      };
    } catch (error) {
      return {
        toolCallId: call.id,
        toolName: call.name,
        args: this.normalizeToolArgs(call.arguments),
        result: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private normalizeToolArgs(value: unknown) {
    if (value === undefined || value === null) {
      return {};
    }

    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        return typeof parsed === 'object' && parsed !== null ? parsed : {};
      } catch (_error) {
        return {};
      }
    }

    return typeof value === 'object' ? value : {};
  }

  private async appendMessage(
    chatId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    metadata: Record<string, unknown>,
  ) {
    const rows = await db
      .insert(chatMessages)
      .values({
        id: createId('msg'),
        sessionId: chatId,
        role,
        content,
        metadata,
        createdAt: new Date(),
      })
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error('Failed to append chat message.');
    }

    return row;
  }

  private async enqueueTitleGeneration(params: {
    chatId: string;
    userId: string;
    workspaceId: string;
    projectName: string;
    projectKey: string;
    message: string;
    provider: ChatProvider;
    model: string;
    ollamaUrl?: string;
  }) {
    await new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 0);
    });

    const generatedTitle = await this.generateChatTitle(params);
    if (!generatedTitle) {
      return;
    }

    await db
      .update(chatSessions)
      .set({
        title: generatedTitle,
      })
      .where(and(eq(chatSessions.id, params.chatId), eq(chatSessions.title, CHAT_TITLE_DEFAULT)));
  }

  private async generateChatTitle(params: {
    userId: string;
    projectName: string;
    projectKey: string;
    message: string;
    provider: ChatProvider;
    model: string;
    ollamaUrl?: string;
  }) {
    const response = await this.ai.chat(params.userId, params.provider, {
      model: params.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a title generator for Gravity chat sessions. Return only a title, no punctuation, under 12 words.',
        },
        {
          role: 'user',
          content: `Project: ${params.projectName} (${params.projectKey})\nUser message: ${params.message}`,
        },
      ],
      ...(params.ollamaUrl ? { ollamaUrl: params.ollamaUrl } : {}),
    });

    return this.sanitizeTitle(response.content);
  }

  private sanitizeTitle(value: string) {
    const title = safeStringify(value)
      .replace(/^"|"$/g, '')
      .replace(/^'|'$/g, '')
      .split('\n')[0]
      ?.trim() ?? '';

    if (!title) {
      return '';
    }

    return title.slice(0, CHAT_TITLE_MAX_LENGTH);
  }

  private toFallbackReason(error: unknown) {
    if (isTimeoutError(error)) {
      return 'timeout';
    }

    if (isTokenLimitError(error)) {
      return 'token_limit';
    }

    return 'provider_error';
  }

  private toFallbackContent(error: unknown) {
    const reason = this.toFallbackReason(error);
    if (reason === 'timeout') {
      return 'The AI request timed out. Please try again.';
    }

    if (reason === 'token_limit') {
      return 'The response was too large for the model. Please shorten your message and retry.';
    }

    if (error instanceof Error && /401|403|credentials|api key|apiKey|authorization|unauthor/i.test(error.message)) {
      return 'AI credentials are missing or not authorized for this action.';
    }

    if (error instanceof Error && /rate.?limit|429/i.test(error.message)) {
      return 'The AI provider returned a rate-limit response. Please try again shortly.';
    }

    return `I’m unable to produce a response right now: ${error instanceof Error ? error.message : 'provider error.'}`;
  }
}
