import { AutoPollEngine } from '../mailbox/poller';
import type { MailboxSync } from '../mailbox/sync';
import type { Message } from '../types/messaging';
import type { L1Response } from '../types/l1';

type PendingRequest = {
  resolve: (response: L1Response) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
};

export class L1Dispatcher {
  private mailbox: MailboxSync;
  private engine: AutoPollEngine | null = null;
  private pending: Map<string, PendingRequest> = new Map();
  private requestTimeoutMs: number;
  private pollIntervalMs: number;
  private useExternalPoller: boolean = false;

  constructor(
    mailbox: MailboxSync,
    requestTimeoutMs: number = 30000,
    pollIntervalMs: number = 1000
  ) {
    this.mailbox = mailbox;
    this.requestTimeoutMs = requestTimeoutMs;
    this.pollIntervalMs = pollIntervalMs;
  }

  /** Called by the unified poller in startListening(). Returns true if msg was an L1 response that matched a pending request. */
  tryDispatch(msg: Message): boolean {
    try {
      const parsed = JSON.parse(msg.content) as L1Response;
      if (parsed.request_id && this.pending.has(parsed.request_id)) {
        const pending = this.pending.get(parsed.request_id)!;
        clearTimeout(pending.timeout);
        this.pending.delete(parsed.request_id);
        pending.resolve(parsed);

        if (this.pending.size === 0 && this.engine) {
          this.engine.stop();
          this.engine = null;
        }
        return true;
      }
    } catch {
      // Not JSON — not an L1 response
    }
    return false;
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  /**
   * When a unified poller (startListening) is running, the L1Dispatcher
   * must not create its own internal poller — both would race on the seq cursor.
   */
  setUseExternalPoller(v: boolean): void {
    this.useExternalPoller = v;
    if (v && this.engine) {
      this.engine.stop();
      this.engine = null;
    }
  }

  register(requestId: string, timeoutMs?: number): Promise<L1Response> {
    const ms = timeoutMs ?? this.requestTimeoutMs;

    return new Promise<L1Response>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`L1 request timed out after ${ms}ms: ${requestId}`));

        if (this.pending.size === 0 && this.engine) {
          this.engine.stop();
          this.engine = null;
        }
      }, ms);

      this.pending.set(requestId, { resolve, reject, timeout });

      // Only start internal poller when no unified poller is active
      if (!this.useExternalPoller && (!this.engine || !this.engine.isRunning())) {
        this.engine = new AutoPollEngine(
          this.mailbox,
          (msg: Message) => { this.tryDispatch(msg); },
          (err: Error) => { /* silent */ },
          this.pollIntervalMs
        );
        this.engine.start();
      }
    });
  }

  /** Clean up a pending request (e.g. when the send itself failed). */
  cancel(requestId: string): void {
    const pending = this.pending.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(requestId);
    }
    if (this.pending.size === 0 && this.engine) {
      this.engine.stop();
      this.engine = null;
    }
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  destroy(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('L1 dispatcher destroyed'));
    }
    this.pending.clear();

    if (this.engine) {
      this.engine.stop();
      this.engine = null;
    }
  }
}
