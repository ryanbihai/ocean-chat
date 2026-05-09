import * as request from 'superagent';
import type { ApiResponse } from '../types/api';
import type { HttpConfig } from '../types/config';
import { ApiError, NetworkError } from './errors';
import { RetryPolicy } from './retry';

// SDK version — read from package.json at build time
const SDK_VERSION = (() => {
  try {
    return require('../../package.json').version as string;
  } catch {
    return '0.0.0';
  }
})();

// Only warn once per process
let _deprecatedWarned = false;

type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface RequestOptions {
  apiKey?: string;
  query?: Record<string, string | number | undefined>;
}

export class HttpClient {
  private baseUrl: string;
  private timeout: number;
  retryPolicy: RetryPolicy;

  constructor(baseUrl: string, config: HttpConfig) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.timeout = config.timeout;
    this.retryPolicy = new RetryPolicy(config.retry);
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private static readonly METHOD_MAP: Record<HttpMethod, (url: string) => request.SuperAgentRequest> = {
    get:    (url: string) => request.get(url),
    post:   (url: string) => request.post(url),
    put:    (url: string) => request.put(url),
    delete: (url: string) => request.del(url),
    patch:  (url: string) => request.patch(url),
  };

  private req(method: HttpMethod, path: string, opts: RequestOptions = {}) {
    const builder = HttpClient.METHOD_MAP[method];
    let r = builder(this.url(path));

    r = r.timeout(this.timeout).ok(() => true);

    // Send SDK version so server can detect outdated clients
    r = r.set('X-OceanBus-SDK-Version', SDK_VERSION);

    if (opts.apiKey) {
      r = r.set('Authorization', `Bearer ${opts.apiKey}`);
    }

    if (opts.query) {
      for (const [k, v] of Object.entries(opts.query)) {
        if (v !== undefined) r = r.query({ [k]: v });
      }
    }

    return r;
  }

  private checkDeprecated(res: request.Response): void {
    if (_deprecatedWarned) return;
    const msg = res.headers['x-oceanbus-deprecated'] as string | undefined;
    if (msg) {
      _deprecatedWarned = true;
      console.warn('[oceanbus] ⚠ Your SDK version is deprecated:', msg);
      console.warn('[oceanbus] Upgrade: npm install oceanbus@latest');
    }
  }

  async request<T = unknown>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    opts: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const doRequest = async (): Promise<ApiResponse<T>> => {
      let r = this.req(method, path, opts);

      if (body !== undefined && body !== null) {
        r = r.send(body as string | object);
      }

      let res: request.Response;
      try {
        res = await r;
      } catch (err: unknown) {
        const e = err as Error & { status?: number };
        throw new NetworkError(`HTTP request failed: ${e.message}`, e);
      }

      // Check for deprecation warning from server
      this.checkDeprecated(res);

      // HTTP 401 with challenge data = POW required (registration flow)
      // Return raw response so caller can extract nonce and compute solution
      if (res.status === 401) {
        const bodyData = res.body;
        if (bodyData?.data?.challenge) {
          return bodyData as ApiResponse<T>;
        }
        throw ApiError.fromResponse(bodyData?.code ?? -1, bodyData?.msg ?? 'unauthorized', 401);
      }

      // Parse body as ApiResponse envelope
      const bodyData = res.body;
      if (!bodyData || typeof bodyData.code === 'undefined') {
        throw new NetworkError('invalid response: missing code field', new Error(JSON.stringify(res.body)));
      }

      // Business error (non-zero code)
      if (bodyData.code !== 0) {
        const retryAfter = res.status === 429 ? parseInt(res.headers['retry-after'] as string, 10) || null : null;
        throw ApiError.fromResponse(bodyData.code, bodyData.msg, res.status, retryAfter);
      }

      return bodyData as ApiResponse<T>;
    };

    return this.retryPolicy.execute(doRequest);
  }

  async get<T = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('get', path, undefined, opts);
  }

  async post<T = unknown>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('post', path, body, opts);
  }

  async put<T = unknown>(path: string, body?: unknown, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('put', path, body, opts);
  }

  async del<T = unknown>(path: string, opts: RequestOptions = {}): Promise<ApiResponse<T>> {
    return this.request<T>('delete', path, undefined, opts);
  }
}
