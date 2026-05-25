export function createMcpErrorResponse(
  id: string | number | null | undefined,
  code: number,
  message: string,
) {
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    error: {
      code,
      message,
    },
  };
}
