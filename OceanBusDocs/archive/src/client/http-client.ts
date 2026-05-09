import * as request from 'superagent';
import type { ApiResponse } from '../types/api';
import type { HttpConfig } from '../types/config';
import { ApiError, NetworkError } from './errors';
import { RetryPolicy } from './retry';

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

  private req(method: HttpMethod, path: string, opts: RequestOptions = {}) {
    // superagent: must cast method to any for dynamic dispatch
    let r: request.SuperAgentRequest;
    switch (method) {
      case 'get':    r = (request as unknown as Record<string, Function>).get(this.url(path)); break;
      case 'post':   r = (request as unknown as Record<string, Function>).post(this.url(path)); break;
      case 'put':    r = (request as unknown as Record<string, Function>).put(this.url(path)); break;
      case 'delete': r = (request as unknown as Record<string, Function>).delete(this.url(path)); break;
      case 'patch':  r = (request as unknown as Record<string, Function>).patch(this.url(path)); break;
      default: throw new Error(`unsupported HTTP method: ${method}`);
    }

    r = r.timeout(this.timeout).ok(() => true);

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

      // HTTP 401 = auth failure
      if (res.status === 401) {
        throw ApiError.fromResponse(res.body?.code ?? -1, res.body?.msg ?? 'unauthorized', 401);
      }

      // Parse body as ApiResponse envelope
      const bodyData = res.body;
      if (!bodyData || typeof bodyData.code === 'undefined') {
        throw new NetworkError('invalid response: missing code field', new Error(JSON.stringify(res.body)));
      }

      // Business error (non-zero code)
      if (bodyData.code !== 0) {
        throw ApiError.fromResponse(bodyData.code, bodyData.msg, res.status);
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
