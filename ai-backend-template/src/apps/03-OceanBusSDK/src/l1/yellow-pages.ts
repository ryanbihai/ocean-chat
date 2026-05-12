import { L1Client, L1Transport } from './base-client';
import type { L1Dispatcher } from './dispatcher';
import type {
  SignedL1Request,
  L1Response,
  YpEntry,
} from '../types/l1';
import { YP_CODE } from '../types/l1';
import { OceanBusError } from '../client/errors';
import { generateRequestId } from '../messaging/idgen';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes (real-time services)

export type PayloadSigner = (payload: Record<string, unknown>) => Promise<string>;

export type HeartbeatErrorCallback = (error: Error) => void;

export interface HeartbeatOptions {
  intervalMs?: number;
  onError?: HeartbeatErrorCallback;
}

export class YellowPagesClient extends L1Client {
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatIntervalMs: number;
  private heartbeatOpenid: string | null = null;
  private heartbeatSigner: PayloadSigner | null = null;
  private onHeartbeatError: HeartbeatErrorCallback | null = null;

  // ── Stored identity — set once, skip openid/signer on every call ──
  private defaultOpenid: string | null = null;
  private defaultSigner: PayloadSigner | null = null;
  private defaultPublicKey: string | null = null;

  constructor(
    sendFn: L1Transport,
    serviceOpenid: string,
    dispatcher?: L1Dispatcher,
    requestTimeoutMs: number = 30000,
    heartbeatIntervalMs: number = DEFAULT_HEARTBEAT_INTERVAL_MS
  ) {
    super(sendFn, serviceOpenid, dispatcher, requestTimeoutMs);
    this.heartbeatIntervalMs = heartbeatIntervalMs;
  }

  // ── identity management ──

  /** Store default identity so subsequent calls can omit openid/signer. */
  setIdentity(openid: string, signer: PayloadSigner, publicKey?: string): void {
    this.defaultOpenid = openid;
    this.defaultSigner = signer;
    if (publicKey !== undefined) this.defaultPublicKey = publicKey;
  }

  /** Clear stored identity. */
  clearIdentity(): void {
    this.defaultOpenid = null;
    this.defaultSigner = null;
    this.defaultPublicKey = null;
  }

  hasIdentity(): boolean {
    return this.defaultOpenid !== null && this.defaultSigner !== null;
  }

  private resolveIdentity(openid?: string, signer?: PayloadSigner): { openid: string; signer: PayloadSigner } {
    const resolvedOpenid = openid ?? this.defaultOpenid;
    const resolvedSigner = signer ?? this.defaultSigner;
    if (!resolvedOpenid || !resolvedSigner) {
      throw new OceanBusError('openid and signer are required — call setIdentity() or pass them explicitly');
    }
    return { openid: resolvedOpenid, signer: resolvedSigner };
  }

  // ── register_service ──

  /** Short form: uses stored identity. */
  async registerService(tags: string[], description: string, publicKey?: string): Promise<L1Response>;
  /** Long form: explicit params (backward compatible). */
  async registerService(openid: string, tags: string[], description: string, publicKey: string, signer: PayloadSigner): Promise<L1Response>;
  async registerService(
    openidOrTags: string | string[],
    tagsOrDesc: string[] | string,
    descOrPubKey?: string,
    pubKeyOrSigner?: string | PayloadSigner,
    signerOrNothing?: PayloadSigner
  ): Promise<L1Response> {
    let openid: string; let tags: string[]; let description: string; let publicKey: string; let signer: PayloadSigner;

    if (Array.isArray(openidOrTags)) {
      // Short form: registerService(tags, description, publicKey?)
      tags = openidOrTags;
      description = tagsOrDesc as string;
      publicKey = descOrPubKey ?? this.defaultPublicKey ?? '';
      ({ openid, signer } = this.resolveIdentity());
    } else {
      // Long form: registerService(openid, tags, description, publicKey, signer)
      openid = openidOrTags;
      tags = tagsOrDesc as string[];
      description = descOrPubKey!;
      publicKey = pubKeyOrSigner as string;
      signer = signerOrNothing!;
    }

    const totalTagChars = tags.reduce((sum, t) => sum + t.length, 0);
    if (totalTagChars > 120) throw new OceanBusError('Tags total character count exceeds 120');
    if (description.length > 800) throw new OceanBusError('Description exceeds 800 characters');

    const payload: Record<string, unknown> = {
      action: 'register_service',
      request_id: generateRequestId(),
      openid,
      tags,
      description,
      public_key: publicKey,
    };
    const sig = await signer(payload);
    return this.sendAction({ ...payload, sig } as SignedL1Request);
  }

  // ── discover (read-only, no signature needed) ──

  async discover(
    tags?: string[],
    limit?: number,
    cursor?: string | null,
    a2aOnly?: boolean
  ): Promise<L1Response<{ entries: YpEntry[]; total: number; next_cursor: string | null }>> {
    const base = this.buildRequest('discover');
    const request = {
      ...base,
      action: 'discover' as const,
      tags,
      limit,
      cursor,
      a2a_only: a2aOnly || undefined,
    };
    const response = await this.sendAction(request);
    if (response.code === YP_CODE.OK && response.data) {
      const d = response.data as Record<string, unknown>;
      if (!Array.isArray(d.entries)) {
        throw new OceanBusError('Yellow Pages discover response missing entries array');
      }
    }
    return response as L1Response<{ entries: YpEntry[]; total: number; next_cursor: string | null }>;
  }

  // ── heartbeat ──

  /** Short form: uses stored identity. */
  async heartbeat(): Promise<L1Response>;
  /** Long form: explicit params (backward compatible). */
  async heartbeat(openid: string, signer: PayloadSigner): Promise<L1Response>;
  async heartbeat(openid?: string, signer?: PayloadSigner): Promise<L1Response> {
    const resolved = this.resolveIdentity(openid, signer);
    const payload: Record<string, unknown> = {
      action: 'heartbeat',
      request_id: generateRequestId(),
      openid: resolved.openid,
    };
    const sig = await resolved.signer(payload);
    return this.sendAction({ ...payload, sig } as SignedL1Request);
  }

  // ── auto heartbeat ──

  /** Short form: uses stored identity. */
  startHeartbeat(options?: HeartbeatOptions): void;
  /** Long form: explicit params (backward compatible). */
  startHeartbeat(openid: string, signer: PayloadSigner, options?: HeartbeatOptions): void;
  startHeartbeat(
    openidOrOptions?: string | HeartbeatOptions,
    signer?: PayloadSigner,
    options?: HeartbeatOptions
  ): void {
    let openid: string; let resolvedSigner: PayloadSigner;
    let resolvedOptions: HeartbeatOptions;

    if (typeof openidOrOptions === 'string') {
      // Long form
      openid = openidOrOptions;
      resolvedSigner = signer!;
      resolvedOptions = options || {};
    } else {
      // Short form
      const resolved = this.resolveIdentity();
      openid = resolved.openid;
      resolvedSigner = resolved.signer;
      resolvedOptions = openidOrOptions || {};
    }

    const intervalMs = resolvedOptions.intervalMs ?? this.heartbeatIntervalMs;
    if (intervalMs <= 0) {
      throw new OceanBusError('Heartbeat interval must be > 0 to enable auto-heartbeat');
    }

    this.stopHeartbeat();
    this.heartbeatOpenid = openid;
    this.heartbeatSigner = resolvedSigner;
    this.onHeartbeatError = resolvedOptions.onError || null;

    const effectiveIntervalMs = intervalMs;
    this.heartbeatTimer = setInterval(async () => {
      try {
        await this.heartbeat(openid, resolvedSigner);
      } catch (e) {
        if (this.onHeartbeatError) {
          this.onHeartbeatError(e instanceof Error ? e : new Error(String(e)));
        }
      }
    }, effectiveIntervalMs);
  }

  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.heartbeatOpenid = null;
    this.heartbeatSigner = null;
    this.onHeartbeatError = null;
  }

  isHeartbeating(): boolean {
    return this.heartbeatTimer !== null;
  }

  // ── update_service ──

  /** Short form: uses stored identity. */
  async updateService(tags?: string[], description?: string): Promise<L1Response>;
  /** Long form: explicit params (backward compatible). */
  async updateService(openid: string, signer: PayloadSigner, tags?: string[], description?: string): Promise<L1Response>;
  async updateService(
    openidOrTags?: string | string[],
    signerOrDesc?: PayloadSigner | string,
    tagsOrNothing?: string[],
    description?: string
  ): Promise<L1Response> {
    let openid: string; let signer: PayloadSigner; let tags: string[] | undefined; let desc: string | undefined;

    if (typeof openidOrTags === 'string' && typeof signerOrDesc === 'function') {
      openid = openidOrTags;
      signer = signerOrDesc;
      tags = tagsOrNothing;
      desc = description;
    } else {
      ({ openid, signer } = this.resolveIdentity());
      tags = openidOrTags as string[] | undefined;
      desc = signerOrDesc as string | undefined;
    }

    const payload: Record<string, unknown> = {
      action: 'update_service',
      request_id: generateRequestId(),
      openid,
    };
    if (tags !== undefined) payload.tags = tags;
    if (desc !== undefined) payload.description = desc;

    const sig = await signer(payload);
    return this.sendAction({ ...payload, sig } as SignedL1Request);
  }

  // ── deregister_service ──

  /** Short form: uses stored identity. */
  async deregisterService(): Promise<L1Response>;
  /** Long form: explicit params (backward compatible). */
  async deregisterService(openid: string, signer: PayloadSigner): Promise<L1Response>;
  async deregisterService(openid?: string, signer?: PayloadSigner): Promise<L1Response> {
    this.stopHeartbeat();
    const resolved = this.resolveIdentity(openid, signer);
    const payload: Record<string, unknown> = {
      action: 'deregister_service',
      request_id: generateRequestId(),
      openid: resolved.openid,
    };
    const sig = await resolved.signer(payload);
    return this.sendAction({ ...payload, sig } as SignedL1Request);
  }

  // ── verify_card ──

  /**
   * Verify an AgentCard against the Yellow Pages stored hash.
   * Read-only, no signature needed.
   */
  async verifyCard(openid: string, cardHash: string): Promise<L1Response<{ verified: boolean; stored_hash: string | null }>> {
    const request = {
      ...this.buildRequest('verify_card'),
      action: 'verify_card' as const,
      openid,
      card_hash: cardHash,
    };
    return this.sendAction(request) as Promise<L1Response<{ verified: boolean; stored_hash: string | null }>>;
  }

  // ── High-level publish / unpublish ──

  /**
   * Publish to Yellow Pages using the already-set identity.
   * Call ob.publish() for the one-step high-level API that handles key setup.
   */
  async publish(options: { tags: string[]; description: string; summary?: string; help_command?: string; card_hash?: string; a2a_compatible?: boolean; a2a_endpoint?: string; autoHeartbeat?: boolean }): Promise<L1Response> {
    const autoHeartbeat = options.autoHeartbeat !== false;
    const resolved = this.resolveIdentity();

    const payload: Record<string, unknown> = {
      action: 'register_service',
      request_id: generateRequestId(),
      openid: resolved.openid,
      tags: options.tags,
      description: options.description,
      public_key: this.defaultPublicKey || '',
    };
    if (options.summary) payload.summary = options.summary;
    if (options.help_command) payload.help_command = options.help_command;
    if (options.card_hash) payload.card_hash = options.card_hash;
    if (options.a2a_compatible !== undefined) payload.a2a_compatible = options.a2a_compatible;
    if (options.a2a_endpoint) payload.a2a_endpoint = options.a2a_endpoint;

    const sig = await resolved.signer(payload);
    const result = await this.sendAction({ ...payload, sig } as SignedL1Request);

    if (result.code === 0 && autoHeartbeat) {
      this.startHeartbeat(resolved.openid, resolved.signer);
    }

    return result;
  }

  /**
   * One-step unpublish: stops heartbeat and deregisters from Yellow Pages.
   */
  async unpublish(): Promise<L1Response> {
    const resolved = this.resolveIdentity();
    const result = await this.deregisterService(resolved.openid, resolved.signer);
    return result;
  }
}
