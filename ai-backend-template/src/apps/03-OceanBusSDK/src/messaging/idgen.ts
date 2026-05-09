import * as crypto from 'crypto';

export function generateClientMsgId(): string {
  return `msg_${crypto.randomUUID()}`;
}

export function generateRequestId(): string {
  return `req_${crypto.randomUUID()}`;
}
