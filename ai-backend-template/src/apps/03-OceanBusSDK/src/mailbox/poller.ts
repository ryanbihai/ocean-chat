import type { Message } from '../types/messaging';
import { MailboxSync } from './sync';

export type MessageHandler = (message: Message) => void | Promise<void>;
export type ErrorHandler = (error: Error) => void;

export class AutoPollEngine {
  private sync: MailboxSync;
  private intervalMs: number;
  private running: boolean = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private onMessage: MessageHandler;
  private onError: ErrorHandler;

  constructor(
    sync: MailboxSync,
    onMessage: MessageHandler,
    onError?: ErrorHandler,
    intervalMs: number = 2000
  ) {
    this.sync = sync;
    this.onMessage = onMessage;
    this.onError = onError || ((err: Error) => { console.error('[oceanbus] polling error:', err.message); });
    this.intervalMs = intervalMs;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.poll();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  private async poll(): Promise<void> {
    while (this.running) {
      try {
        const messages = await this.sync.sync();
        for (const msg of messages) {
          try {
            await this.onMessage(msg);
          } catch (handlerErr) {
            this.onError(handlerErr as Error);
          }
        }
      } catch (err) {
        this.onError(err as Error);
      }

      // Wait for next interval, but check running flag
      await new Promise<void>((resolve) => {
        if (!this.running) { resolve(); return; }
        this.timer = setTimeout(() => {
          this.timer = null;
          resolve();
        }, this.intervalMs);
      });
    }
  }
}
