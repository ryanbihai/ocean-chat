import * as path from 'path';
import * as os from 'os';
import { DEFAULTS } from './defaults';
import type { OceanBusConfig, PartialConfig } from '../types/config';

function safeInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? undefined : n;
}

function envConfig(): PartialConfig {
  const result: Record<string, unknown> = {};

  if (process.env.OCEANBUS_BASE_URL) result.baseUrl = process.env.OCEANBUS_BASE_URL;

  const timeout = safeInt(process.env.OCEANBUS_TIMEOUT);
  if (timeout !== undefined) result.http = { timeout };

  const pollInterval = safeInt(process.env.OCEANBUS_POLL_INTERVAL);
  if (pollInterval !== undefined) result.mailbox = { pollIntervalMs: pollInterval };

  if (process.env.OCEANBUS_YP_OPENIDS) {
    result.l1 = { ypOpenids: process.env.OCEANBUS_YP_OPENIDS.split(',').map(s => s.trim()).filter(Boolean) };
  }
  if (process.env.OCEANBUS_REP_OPENID) {
    result.l1 = { ...(result.l1 || {}), repOpenid: process.env.OCEANBUS_REP_OPENID.trim() };
  }

  if (process.env.OCEANBUS_API_KEY) {
    result.identity = { agent_id: process.env.OCEANBUS_AGENT_ID || '', api_key: process.env.OCEANBUS_API_KEY };
  }


  return result as PartialConfig;
}

function merge<T extends Record<string, unknown>>(base: T, ...overrides: Partial<T>[]): T {
  const result = { ...base };
  for (const override of overrides) {
    if (!override) continue;
    for (const key of Object.keys(override) as (keyof T)[]) {
      const overrideVal = override[key];
      const baseVal = result[key];
      if (
        overrideVal !== undefined &&
        overrideVal !== null &&
        typeof overrideVal === 'object' &&
        !Array.isArray(overrideVal) &&
        typeof baseVal === 'object' &&
        !Array.isArray(baseVal) &&
        baseVal !== null
      ) {
        result[key] = merge(baseVal as Record<string, unknown>, overrideVal as Record<string, unknown>) as T[keyof T];
      } else {
        result[key] = overrideVal as T[keyof T];
      }
    }
  }
  return result;
}

export function resolveConfig(userConfig?: PartialConfig): OceanBusConfig {
  let config = merge(DEFAULTS as unknown as Record<string, unknown>) as unknown as OceanBusConfig;

  config = merge(config as unknown as Record<string, unknown>, envConfig() as unknown as Record<string, unknown>) as unknown as OceanBusConfig;

  if (userConfig) {
    config = merge(config as unknown as Record<string, unknown>, userConfig as unknown as Record<string, unknown>) as unknown as OceanBusConfig;
  }

  if (config.keyStore.type === 'file' && !config.keyStore.filePath) {
    config.keyStore.filePath = path.join(os.homedir(), '.oceanbus', 'credentials.json');
  }

  return config;
}

export function getOceanBusDir(): string {
  return path.join(os.homedir(), '.oceanbus');
}
