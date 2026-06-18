export type McpErrorData = Record<string, unknown>;

export class McpToolError extends Error {
  readonly code: number;

  readonly data?: McpErrorData;

  constructor(message: string, code = -32603, data?: McpErrorData) {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
    this.data = data;
  }
}

export class McpToolValidationError extends McpToolError {
  constructor(message: string, data: McpErrorData = {}) {
    super(message, -32602, data);
    this.name = 'McpToolValidationError';
  }
}
