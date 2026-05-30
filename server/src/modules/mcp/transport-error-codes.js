// Transport-specific JSON-RPC error codes (server-local namespace)
// Use -320xx to avoid colliding with JSON-RPC standard codes.
export const ERR_MISSING_CONTENT_LENGTH = -32010;
export const ERR_INVALID_CONTENT_LENGTH = -32011;
export const ERR_CONTENT_LENGTH_TOO_LARGE = -32012;
export const ERR_MESSAGE_TOO_LARGE = -32013;

export const DEFAULT_TRANSPORT_ERROR_MESSAGES = {
  [ERR_MISSING_CONTENT_LENGTH]: 'Missing Content-Length header',
  [ERR_INVALID_CONTENT_LENGTH]: 'Invalid Content-Length header',
  [ERR_CONTENT_LENGTH_TOO_LARGE]: 'Content-Length too large',
  [ERR_MESSAGE_TOO_LARGE]: 'Message too large',
};
