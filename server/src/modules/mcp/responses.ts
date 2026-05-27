/**
 * @description Creates a JSON-RPC error envelope with a normalized nullable
 * request id.
 * @param id The request id associated with the failing call.
 * @param code The JSON-RPC error code.
 * @param message The JSON-RPC error message.
 * @return A JSON-RPC error response payload.
 */
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
