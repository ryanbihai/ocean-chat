import type { OceanBusConfig } from '../types/config';

export const DEFAULTS: OceanBusConfig = {
  baseUrl: 'https://ai-t.ihaola.com.cn/api/l0',

  keyStore: {
    type: 'file',
    filePath: undefined, // resolved at runtime to ~/.oceanbus/credentials.json
  },

  http: {
    timeout: 10000,
    retry: {
      maxAttempts: 3,
      initialDelayMs: 500,
      maxDelayMs: 8000,
      multiplier: 2,
    },
  },

  mailbox: {
    pollIntervalMs: 2000,
    defaultPageSize: 100,
    cursorPersistence: true,
  },

  l1: {
    ypOpenids: [],
    repOpenid: '',
    trustedCAs: [],
    requestTimeoutMs: 30000,
    requestPollIntervalMs: 1000,
    heartbeatIntervalMs: 5 * 60 * 1000, // 5 min default for real-time services
  },

  interceptor: {
    enabled: false,
  },

};
