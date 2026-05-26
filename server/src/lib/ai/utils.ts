/**
 * Performs an HTTP fetch request with a specified timeout.
 * @param {string} url - The URL to request.
 * @param {RequestInit} init - Standard fetch request parameters.
 * @param {number} timeoutMs - Timeout in milliseconds.
 * @return {Promise<Response>} The fetch response.
 */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Attempts to parse an error message from a failed fetch response.
 * @param {Response} response - The failed fetch response.
 * @param {string} fallback - The fallback message if parsing fails.
 * @return {Promise<string>} The parsed error message.
 */
export async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string | { message?: string } };
    if (typeof data.error === 'string') {
      return data.error;
    }
    if (typeof data.error?.message === 'string') {
      return data.error.message;
    }
  } catch {
    // Fall through.
  }

  try {
    const text = await response.text();
    return text || fallback;
  } catch {
    return fallback;
  }
}
