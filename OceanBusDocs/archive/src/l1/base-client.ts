import type { L1Request, L1Response } from '../types/l1';
import { generateRequestId } from '../messaging/idgen';
import { OceanBusError } from '../client/errors';
import type { L1Dispatcher } from './dispatcher';

export interface L1Transport {
  send(toOpenid: string, content: string, clientMsgId?: string): Promise<void>;
  sendJson(toOpenid: string, data: object, clientMsgId?: string): Promise<void>;
}

export class L1Client {
  protected sendFn: L1Transport;
  protected serviceOpenid: string;
  protected requestTimeoutMs: number;
  private dispatcher: L1Dispatcher | null;

  constructor(
    sendFn: L1Transport,
    serviceOpenid: string,
    dispatcher?: L1Dispatcher,
    requestTimeoutMs: number = 30000
  ) {
    this.sendFn = sendFn;
    this.serviceOpenid = serviceOpenid;
    this.dispatcher = dispatcher || null;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  setDispatcher(dispatcher: L1Dispatcher): void {
    this.dispatcher = dispatcher;
  }

  protected buildRequest(action: string, extra: Record<string, unknown> = {}): L1Request {
    return {
      action,
      request_id: generateRequestId(),
      ...extra,
    };
  }

  async sendAction(request: L1Request): Promise<L1Response> {
    if (!this.dispatcher) {
      throw new OceanBusError('L1 dispatcher not configured');
    }

    // Register pending request with dispatcher BEFORE sending
    const responsePromise = this.dispatcher.register(request.request_id, this.requestTimeoutMs);

    // Send the request — if sending fails, clean up the pending entry immediately
    try {
      await this.sendFn.sendJson(this.serviceOpenid, request);
    } catch (e) {
      this.dispatcher.cancel(request.request_id);
      throw e;
    }

    // Wait for the shared dispatcher to match the response
    return responsePromise;
  }
}
