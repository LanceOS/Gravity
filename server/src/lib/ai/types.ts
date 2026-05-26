export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface ChatOptions {
  model: string;
  messages: Message[];
  tools?: any[];
  apiKey?: string;
  ollamaUrl?: string;
}

export interface IAiProvider {
  chat(options: ChatOptions): Promise<{ content: string; toolCalls?: any[] }>;
  testConnection(apiKey: string): Promise<void>;
}
