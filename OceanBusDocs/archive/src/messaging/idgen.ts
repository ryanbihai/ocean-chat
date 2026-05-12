import * as crypto from 'crypto';

export function generateClientMsgId(): string {
  return `msg_${Date.now()}_${crypto.randomUUID()}`;
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${crypto.randomUUID()}`;
}
