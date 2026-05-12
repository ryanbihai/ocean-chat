import { HttpClient } from '../client/http-client';
import type { SendPayload } from '../types/messaging';
import { ErrorCode } from '../types/api';
import { OceanBusError, ApiError } from '../client/errors';
import { generateClientMsgId } from './idgen';

const MAX_CONTENT_LENGTH = 2000;

export class MessagingService {
  private http: HttpClient;
  private getApiKey: () => string | null;

  constructor(http: HttpClient, getApiKey: () => string | null) {
    this.http = http;
    this.getApiKey = getApiKey;
  }

  async send(toOpenid: string, content: string, clientMsgId?: string): Promise<void> {
    if (!toOpenid || toOpenid.trim().length === 0) {
      throw new OceanBusError('toOpenid must not be empty');
    }

    const apiKey = this.getApiKey();
    if (!apiKey) throw new OceanBusError('Not authenticated');

    // Validate content length
    if (content.length > MAX_CONTENT_LENGTH) {
      throw new OceanBusError(`Content exceeds ${MAX_CONTENT_LENGTH} character limit (${content.length})`);
    }

    const payload: SendPayload = {
      to_openid: toOpenid,
      client_msg_id: clientMsgId || generateClientMsgId(),
      content,
    };

    try {
      await this.http.post('/messages', payload, { apiKey });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === ErrorCode.BLOCKED_RECIPIENT) {
          throw new OceanBusError('Message blocked: recipient has blocked this sender');
        }
        if (err.code === ErrorCode.INVALID_OPENID) {
          throw new OceanBusError('Invalid recipient OpenID');
        }
        if (err.code === ErrorCode.CONTENT_TOO_LONG) {
          throw new OceanBusError(`Content too long (max ${MAX_CONTENT_LENGTH} chars)`);
        }
      }
      throw err;
    }
  }

  async sendJson(toOpenid: string, data: object, clientMsgId?: string): Promise<void> {
    const content = JSON.stringify(data);
    return this.send(toOpenid, content, clientMsgId);
  }
}
