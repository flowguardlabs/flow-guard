/**
 * Transport. One place that knows how to talk to the API, so every resource gets
 * the same error shape, timeout behaviour and retry classification.
 */

import { ApiError } from './errors.js';

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

export interface HttpOptions {
  baseUrl: string;
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Merged into every request. Used for tracing headers, not for auth. */
  headers?: Record<string, string>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Skip JSON parsing and hand back the raw response. */
  raw?: boolean;
}

const DEFAULT_TIMEOUT_MS = 30_000;

function resolveFetch(supplied?: FetchLike): FetchLike {
  if (supplied) return supplied;
  const g = globalThis as { fetch?: unknown };
  if (typeof g.fetch === 'function') return g.fetch.bind(globalThis) as FetchLike;
  throw new Error(
    'No fetch implementation found. Node 18+ provides one globally; on older runtimes ' +
      'pass `fetch` in the client options.',
  );
}

/** Pull a human-usable message out of the several error shapes the API emits. */
function extractError(body: unknown): { message?: string; code?: string } {
  if (!body || typeof body !== 'object') return {};
  const record = body as Record<string, unknown>;
  const message =
    typeof record.message === 'string'
      ? record.message
      : typeof record.error === 'string'
        ? record.error
        : undefined;
  const code = typeof record.error === 'string' ? record.error : undefined;
  return { message, code };
}

function buildQuery(query: RequestOptions['query']): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  }
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export class Http {
  private readonly baseUrl: string;
  private readonly doFetch: FetchLike;
  private readonly timeoutMs: number;
  private readonly baseHeaders: Record<string, string>;

  constructor(options: HttpOptions) {
    // Normalise so callers may pass either https://api.flowguard.cash or .../api
    this.baseUrl = options.baseUrl.replace(/\/+$/, '').replace(/\/api$/, '');
    this.doFetch = resolveFetch(options.fetch);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.baseHeaders = options.headers ?? {};
  }

  /** Absolute URL for an `/api`-relative path, e.g. `/payments/create`. */
  url(path: string): string {
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}/api${suffix}`;
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = this.url(path) + buildQuery(options.query);
    const headers: Record<string, string> = { ...this.baseHeaders, ...options.headers };

    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Honour a caller's own AbortSignal while still applying our timeout.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const onExternalAbort = () => controller.abort();
    options.signal?.addEventListener('abort', onExternalAbort);

    try {
      const response = await this.doFetch(url, {
        method: options.method ?? 'GET',
        headers,
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
        signal: controller.signal,
      });

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        parsed = undefined;
      }

      if (!response.ok) {
        const { message, code } = extractError(parsed);
        throw new ApiError({
          status: response.status,
          path,
          message: message ?? `${response.status} ${response.statusText}`,
          ...(code !== undefined ? { code } : {}),
          body: parsed,
        });
      }

      return parsed as T;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onExternalAbort);
    }
  }

  get<T>(path: string, options: Omit<RequestOptions, 'method' | 'body'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T>(path: string, body?: unknown, options: Omit<RequestOptions, 'method'> = {}): Promise<T> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }
}
