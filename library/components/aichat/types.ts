export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown> | string;
  }>;
  tool_call_id?: string;
  name?: string;
}

export interface MarkdownTextProps {
  text: string;
}
