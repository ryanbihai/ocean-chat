import type { TrustAnchor } from './crypto';

export interface KeyStoreConfig {
  type: 'file' | 'memory';
  filePath?: string;
}

export interface HttpConfig {
  timeout: number;
  retry: {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    multiplier: number;
  };
}

export interface MailboxConfig {
  pollIntervalMs: number;
  defaultPageSize: number;
  cursorPersistence: boolean;
}

export interface L1Config {
  ypOpenids: string[];
  repOpenid: string;
  trustedCAs: TrustAnchor[];
  requestTimeoutMs: number;
  requestPollIntervalMs: number;
  heartbeatIntervalMs: number;
}

export interface InterceptorConfig {
  enabled: boolean;
}

export interface OceanBusConfig {
  baseUrl: string;
  identity?: {
    agent_id: string;
    api_key: string;
    openid?: string;
  };
  keyStore: KeyStoreConfig;
  http: HttpConfig;
  mailbox: MailboxConfig;
  l1: L1Config;
  interceptor: InterceptorConfig;
}

type DeepPartial<T> = T extends object ? {
  [P in keyof T]?: T[P] extends Array<infer U> ? Array<DeepPartial<U>> :
    T[P] extends object ? DeepPartial<T[P]> : T[P];
} : T;

export type PartialConfig = DeepPartial<OceanBusConfig> & {
  identity?: { agent_id: string; api_key: string; openid?: string };
};
