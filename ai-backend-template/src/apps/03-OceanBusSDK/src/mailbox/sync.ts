import { HttpClient } from '../client/http-client';
import type { Message, SyncData } from '../types/messaging';
import { OceanBusError } from '../client/errors';
import { SeqCursor } from './cursor';

const MAX_PAGE_SIZE = 500;
const MAX_PAGINATION_ITERATIONS = 50;

export class MailboxSync {
  private http: HttpClient;
  private getApiKey: () => string | null;
  private cursor: SeqCursor;
  private defaultPageSize: number;

  constructor(
    http: HttpClient,
    getApiKey: () => string | null,
    cursor: SeqCursor,
    defaultPageSize: number = 100
  ) {
    this.http = http;
    this.getApiKey = getApiKey;
    this.cursor = cursor;
    this.defaultPageSize = Math.min(defaultPageSize, MAX_PAGE_SIZE);
  }

  getCursor(): SeqCursor {
    return this.cursor;
  }

  async sync(sinceSeq?: number, limit?: number): Promise<Message[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new OceanBusError('Not authenticated');

    const allMessages: Message[] = [];
    let currentSince = sinceSeq ?? this.cursor.get();
    const pageSize = limit ?? this.defaultPageSize;
    let iteration = 0;

    while (iteration < MAX_PAGINATION_ITERATIONS) {
      iteration++;
      const res = await this.http.get<SyncData>('/messages/sync', {
        apiKey,
        query: {
          since_seq: currentSince,
          limit: pageSize,
        },
      });

      const { messages, has_more } = res.data;

      if (messages && messages.length > 0) {
        allMessages.push(...messages);

        for (const msg of messages) {
          this.cursor.set(msg.seq_id);
        }

        currentSince = this.cursor.get();
      }

      // Exit conditions
      if (!has_more) break;

      // Guard: if has_more is true but no messages were returned, break to avoid infinite loop
      if (!messages || messages.length === 0) break;

      if (limit && allMessages.length >= limit) break;
    }

    await this.cursor.save();

    return allMessages;
  }
}
