const API_BASE_URL = '/api/v1';
const RETRY_BASE_DELAY_MS = 300;

export class ApiError extends Error {
  public status: number;
  public data: any;

  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

interface RequestOptions extends RequestInit {
  /** Injects the `x-project-id` header. For a differently-cased project header, pass it via `headers` instead. */
  projectId?: string;
  params?: Record<string, string | undefined | null>;
  skipContentTypeHeader?: boolean;
  /** Retries on transport-level failures only (thrown/rejected fetch), never on HTTP error responses. Opt-in — 0 by default so it doesn't stack with a caller's own retry policy (e.g. React Query's). */
  retries?: number;
}

function resolveUrl(endpoint: string, params?: RequestOptions['params']): string {
  let url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        searchParams.append(key, value);
      }
    });
    const qs = searchParams.toString();
    if (qs) {
      url += `?${qs}`;
    }
  }

  return url;
}

function buildConfig(options: RequestOptions): RequestInit {
  const { projectId, params, skipContentTypeHeader, headers, retries, ...customConfig } = options;

  const config: RequestInit = {
    ...customConfig,
    headers: {
      ...(skipContentTypeHeader ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  };

  if (projectId) {
    (config.headers as Record<string, string>)['x-project-id'] = projectId;
  }

  return config;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string, config: RequestInit, retries: number): Promise<Response> {
  let attempt = 0;
  for (;;) {
    try {
      return await fetch(url, config);
    } catch (err) {
      if (isAbortError(err) || attempt >= retries) {
        throw err;
      }
      await wait(RETRY_BASE_DELAY_MS * 2 ** attempt);
      attempt += 1;
    }
  }
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = resolveUrl(endpoint, options.params);
  const config = buildConfig(options);
  const retries = options.retries ?? 0;

  const response = await fetchWithRetry(url, config, retries);

  let data;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    const errorMessage = data?.error || data?.message || response.statusText || 'An error occurred';
    throw new ApiError(response.status, errorMessage, data);
  }

  return data as T;
}

async function requestRaw(endpoint: string, options: RequestOptions = {}): Promise<Response> {
  const url = resolveUrl(endpoint, options.params);
  const config = buildConfig({ method: 'GET', ...options });
  const retries = options.retries ?? 0;

  return fetchWithRetry(url, config, retries);
}

export const apiClient = {
  get: <T>(endpoint: string, options?: RequestOptions) => request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body: any, options?: RequestOptions) => request<T>(endpoint, { ...options, method: 'POST', body: JSON.stringify(body) }),
  patch: <T>(endpoint: string, body: any, options?: RequestOptions) => request<T>(endpoint, { ...options, method: 'PATCH', body: JSON.stringify(body) }),
  put: <T>(endpoint: string, body: any, options?: RequestOptions) => request<T>(endpoint, { ...options, method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(endpoint: string, options?: RequestOptions) => request<T>(endpoint, { ...options, method: 'DELETE' }),
  postBinary: <T>(endpoint: string, body: BodyInit | null, options?: RequestOptions) => request<T>(endpoint, {
    ...options,
    method: 'POST',
    body,
    skipContentTypeHeader: true,
  }),
  raw: (endpoint: string, options?: RequestOptions) => requestRaw(endpoint, options),
};
