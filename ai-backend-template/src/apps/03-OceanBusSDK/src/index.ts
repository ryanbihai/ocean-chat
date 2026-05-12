import { HttpClient } from './client/http-client';
import { FileKeyStore, MemoryKeyStore } from './agent/store';
import type { KeyStore } from './agent/store';
import { AgentIdentityManager } from './agent/identity';
import { ApiKeyManager } from './agent/keys';
import { MessagingService } from './messaging/send';
import { BlocklistManager } from './messaging/blocklist';
import { MailboxSync } from './mailbox/sync';
import { AutoPollEngine } from './mailbox/poller';
import type { MessageHandler } from './mailbox/poller';
import { SeqCursor } from './mailbox/cursor';
import { resolveConfig } from './config/loader';
import { DEFAULTS } from './config/defaults';
import { fetchWellKnown } from './bootstrap/well-known';
import type { OceanBusConfig, PartialConfig } from './types/config';
import type { RegistrationData } from './types/agent';
import type { Message } from './types/messaging';
import type { ListenOptions, SendOptions } from './types/messaging';
import { OceanBusError } from './client/errors';
import { RosterService } from './roster/index';

// Crypto
import {
  generateKeypair,
  sign,
  verify,
  keypairToHex,
  hexToKeypair,
  keypairToBase64url,
  base64urlToKeypair,
} from './crypto/ed25519';
import { canonicalize } from './crypto/canonical-json';
import { computeCardHash, verifyCardHash } from './crypto/sha256';
import type { Ed25519KeyPair, Certificate, CertVerifyResult, TrustAnchor } from './types/crypto';
import type { AgentCard, AgentCardHandler } from './types/l1';

// L1
import { L1Dispatcher } from './l1/dispatcher';
import { YellowPagesClient } from './l1/yellow-pages';
import type { PayloadSigner } from './l1/yellow-pages';
import { CAClient } from './l1/ca';
import { ReputationClient } from './l1/reputation';

// Interceptors
import { InterceptorChain } from './interceptors/chain';
import type { InterceptorContext } from './interceptors/chain';
import { LLMInterceptor, noopEvaluator } from './interceptors/llm';


export class OceanBus {
  config: OceanBusConfig;
  http: HttpClient;
  identity: AgentIdentityManager;
  keys: ApiKeyManager;
  messaging: MessagingService;
  blocklist: BlocklistManager;
  mailbox: MailboxSync;
  private poller: AutoPollEngine | null = null;
  private keyStore: KeyStore;
  private cursor: SeqCursor;
  private l1Dispatcher: L1Dispatcher | null = null;
  private agentCardHandler: AgentCardHandler | null = null;

  // Crypto
  crypto: {
    generateKeypair: () => Promise<Ed25519KeyPair>;
    sign: (keypair: Ed25519KeyPair, payload: Record<string, unknown>) => Promise<string>;
    verify: (publicKey: Uint8Array, payload: Record<string, unknown>, sig: string) => Promise<boolean>;
    canonicalize: (obj: unknown) => string;
    keypairToHex: (kp: Ed25519KeyPair) => { publicKey: string; secretKey: string };
    hexToKeypair: (pubHex: string, secHex: string) => Ed25519KeyPair;
    keypairToBase64url: (kp: Ed25519KeyPair) => { publicKey: string; secretKey: string };
    base64urlToKeypair: (pubStr: string, secStr: string) => Ed25519KeyPair;
    verifyCertificate: (cert: Certificate, trustedCAs: TrustAnchor[]) => Promise<CertVerifyResult>;
  };

  // L1
  l1!: {
    yellowPages: YellowPagesClient;
    ca: CAClient;
    reputation: ReputationClient;
  };

  // Interceptors
  interceptors: InterceptorChain;

  // Roster
  roster: RosterService;


  private constructor(config: OceanBusConfig, keyStore: KeyStore) {
    this.config = config;
    this.keyStore = keyStore;

    // HTTP client
    this.http = new HttpClient(config.baseUrl, config.http);

    // Identity
    this.identity = new AgentIdentityManager(
      this.http,
      config.identity?.api_key,
      config.identity?.agent_id
    );

    // API Keys
    this.keys = new ApiKeyManager(this.http, () => this.identity.getApiKey());

    // Messaging
    this.messaging = new MessagingService(this.http, () => this.identity.getApiKey(), () => this.identity.getPersistedOpenId());

    // Blocklist
    this.blocklist = new BlocklistManager(this.http, () => this.identity.getApiKey());

    // Mailbox cursor
    this.cursor = new SeqCursor();
    this.mailbox = new MailboxSync(
      this.http,
      () => this.identity.getApiKey(),
      this.cursor,
      config.mailbox.defaultPageSize
    );

    // Interceptors
    this.interceptors = new InterceptorChain();
    if (config.interceptor.enabled) {
      // Note: noopEvaluator passes all messages — user must provide custom LLMEvaluatorFn
      // via ob.interceptors.register(new LLMInterceptor(yourEvaluator))
      this.interceptors.register(new LLMInterceptor(noopEvaluator));
    }

    // Roster
    this.roster = new RosterService();


    // Crypto
    this.crypto = {
      generateKeypair,
      sign: (keypair: Ed25519KeyPair, payload: Record<string, unknown>) => sign(keypair.secretKey, payload),
      verify,
      canonicalize,
      keypairToHex,
      hexToKeypair,
      keypairToBase64url,
      base64urlToKeypair,
      verifyCertificate: async (cert: Certificate, trustedCAs?: TrustAnchor[]) => {
        // Use the shared CAClient if available (post-create), otherwise create a temp one
        if (this.l1) {
          return this.l1.ca.verifyCertificateOffline(cert);
        }
        const ca = new CAClient(
          { send: () => Promise.resolve(), sendJson: () => Promise.resolve() },
          '',
          trustedCAs || []
        );
        return ca.verifyCertificateOffline(cert);
      },
    };
  }

  static async create(userConfig?: PartialConfig): Promise<OceanBus> {
    const config = resolveConfig(userConfig);

    // Initialize key store
    let keyStore: KeyStore;
    if (config.keyStore.type === 'file') {
      keyStore = new FileKeyStore(config.keyStore.filePath);
    } else {
      keyStore = new MemoryKeyStore();
    }

    const ob = new OceanBus(config, keyStore);

    // Always load persisted identity from keyStore.
    // The saved OpenID must be reused — calling newOpenId() generates a new
    // anti-tracking nonce each time, which breaks service-side reachability.
    const saved = await keyStore.load();
    if (saved) {
      if (!config.identity?.api_key) {
        ob.identity.loadFromPersistedState(saved);
      } else if (saved.openid) {
        ob.identity.setPersistedOpenId(saved.openid);
      }
    }

    // OpenID passed directly in config (e.g. from chat.js credentials file)
    if (config.identity?.openid) {
      ob.identity.setPersistedOpenId(config.identity.openid);
    }

    // Load persisted blocklist
    await ob.blocklist.loadLocal();


    // Load seq cursor
    await ob.cursor.load();

    // Set up shared L1 dispatcher — one polling engine for all L1 requests
    ob.l1Dispatcher = new L1Dispatcher(
      ob.mailbox,
      config.l1.requestTimeoutMs,
      config.l1.requestPollIntervalMs
    );

    // L1 clients — try well-known first, fall back to built-in cache
    let ypOpenid = config.l1.ypOpenids[0] || DEFAULTS.l1.ypOpenids[0];
    let repOpenid = config.l1.repOpenid || DEFAULTS.l1.repOpenid;

    // If user didn't override via env/config, try fetching from server
    if (!config.l1.ypOpenids[0]) {
      const wellKnown = await fetchWellKnown(config.baseUrl);
      if (wellKnown) {
        ypOpenid = wellKnown.yellow_pages;
        repOpenid = wellKnown.reputation;
      }
    }
    const transport = {
      send: (to: string, content: string, cid?: string) => ob.messaging.send(to, content, cid ? { clientMsgId: cid } : undefined),
      sendJson: (to: string, data: object, cid?: string) => ob.messaging.sendJson(to, data, cid ? { clientMsgId: cid } : undefined),
    };

    ob.l1 = {
      yellowPages: new YellowPagesClient(
        transport,
        ypOpenid || '',
        ob.l1Dispatcher,
        config.l1.requestTimeoutMs,
        config.l1.heartbeatIntervalMs
      ),
      ca: new CAClient(
        transport,
        config.l1.trustedCAs[0]?.ca_openid || '',
        config.l1.trustedCAs,
        ob.l1Dispatcher,
        config.l1.requestTimeoutMs
      ),
      reputation: new ReputationClient(
        transport,
        repOpenid || '',
        ob.l1Dispatcher,
        config.l1.requestTimeoutMs
      ),
    };

    // Ensure default system contacts (YP + Reputation) exist in roster.
    // Idempotent — skips if already present. Runs on every create(), not just register().
    await ob.bootstrapRoster().catch(() => {});

    return ob;
  }

  private async bootstrapRoster(): Promise<void> {
    // Use resolved OpenIDs (from well-known, env, or built-in fallback)
    const ypOpenid = this.config.l1.ypOpenids[0] || DEFAULTS.l1.ypOpenids[0];
    const repOpenid = this.config.l1.repOpenid || DEFAULTS.l1.repOpenid;

    const contacts = [
      {
        id: 'oceanbus-yp', name: 'OceanBus 黄页', openid: ypOpenid,
        tags: ['system', 'yellow-pages', 'discovery'],
        notes: '搜索 AI Agent 和服务。说"帮我找XX"即可。',
        aliases: ['黄页', 'Yellow Pages', 'YP'],
      },
      {
        id: 'oceanbus-reputation', name: 'OceanBus 声誉', openid: repOpenid,
        tags: ['system', 'reputation', 'trust'],
        notes: '查询 Agent 声誉和信任数据。',
        aliases: ['声誉', 'Reputation', 'REP'],
      },
    ];

    for (const c of contacts) {
      const existingById = await this.roster.get(c.id);
      if (existingById && existingById.status !== 'archived') continue;
      const existingByOpenId = await this.roster.findByOpenId(c.openid);
      if (existingByOpenId && existingByOpenId.status !== 'archived') continue;

      try {
        await this.roster.add({
          id: c.id, name: c.name,
          agents: [{ agentId: '', openId: c.openid, purpose: 'L1 service', isDefault: true }],
          tags: c.tags, notes: c.notes,
          source: 'system' as const, aliases: c.aliases,
        });
      } catch { /* already exists */ }
    }
  }

  // Identity convenience methods
  async register(): Promise<RegistrationData> {
    const data = await this.identity.register();
    // Fetch and persist OpenID immediately
    try { await this.identity.newOpenId(); } catch {}
    await this.keyStore.save(this.identity.exportState());
    // Bootstrap default contacts (YP + Reputation)
    await this.bootstrapRoster().catch(() => {});
    return data;
  }

  /** Generate a new OpenID nonce. Each call returns a different value. For stable address, use getOpenId(). */
  async newOpenId(): Promise<{ agent_id: string; openid: string }> {
    const data = await this.identity.newOpenId();
    // Persist newly fetched OpenID
    if (data.my_openid) await this.keyStore.save(this.identity.exportState());
    return { agent_id: this.identity.getAgentId()!, openid: data.my_openid };
  }

  async getOpenId(): Promise<string> {
    return this.identity.getOpenId();
  }

  /** @deprecated Use getOpenId() for stable identity, or newOpenId() to generate a new nonce. */
  async whoami(): Promise<{ agent_id: string; openid: string }> {
    console.warn('[oceanbus] ⚠ whoami() is deprecated. Use getOpenId() (stable) or newOpenId() (new nonce). This method will be removed in a future version.');
    console.warn('[oceanbus]   getOpenId()  = your stable receiving OpenID (persisted across sessions)');
    console.warn('[oceanbus]   newOpenId()  = generate a new anti-tracking nonce (changes your address)');
    const openid = await this.getOpenId();
    return { agent_id: this.identity.getAgentId()!, openid };
  }

  /** One-liner: generate an Ed25519 keypair and return everything needed for Yellow Pages registration. */
  async createServiceKey(): Promise<{
    publicKey: string;
    signer: PayloadSigner;
    keypair: Ed25519KeyPair;
  }> {
    const keypair = await generateKeypair();
    const { publicKey } = keypairToBase64url(keypair);
    const signer: PayloadSigner = async (payload) => sign(keypair.secretKey, payload);
    return { publicKey, signer, keypair };
  }

  // API Key convenience methods
  async createApiKey(): Promise<{ key_id: string; api_key: string }> {
    return this.keys.createApiKeyWithRetry();
  }

  async revokeApiKey(keyId: string): Promise<void> {
    return this.keys.revokeApiKey(keyId);
  }

  // AgentCard

  /**
   * Register a handler that auto-responds to AgentCard requests.
   * Other agents can then call ob.getAgentCard(yourOpenid) to retrieve your AgentCard.
   */
  serveAgentCard(handler: AgentCardHandler): void {
    this.agentCardHandler = handler;
  }

  /**
   * Request another agent's full AgentCard via direct OceanBus message.
   * The target agent must have registered a handler via serveAgentCard().
   */
  async getAgentCard(targetOpenid: string): Promise<AgentCard> {
    if (!this.l1Dispatcher) throw new OceanBusError('Not ready — start listening first');

    const requestId = `ac_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const responsePromise = this.l1Dispatcher.register(requestId, 30000);

    try {
      await this.messaging.sendJson(targetOpenid, {
        action: 'get_agent_card',
        request_id: requestId,
        requester_openid: await this.getOpenId(),
      });
    } catch (e) {
      this.l1Dispatcher.cancel(requestId);
      throw e;
    }

    const response = await responsePromise;
    if (response.code !== 0) {
      throw new OceanBusError(`AgentCard request failed: ${response.msg || 'unknown error'}`);
    }
    return (response.data as { card: AgentCard }).card;
  }

  /**
   * Local-only AgentCard verification — pure SHA-256 comparison.
   * No network call.
   */
  verifyCardLocal(card: AgentCard, expectedHash: string): boolean {
    return verifyCardHash(card as unknown as Record<string, unknown>, expectedHash);
  }

  // Yellow Pages convenience methods

  /**
   * One-step publish to Yellow Pages.
   * Handles key generation, signing, identity, and heartbeat internally.
   *
   * @example
   * await ob.publish({
   *   tags: ['insurance', 'health', 'Beijing'],
   *   description: '小王 — 10年健康险专家，免费咨询',
   *   summary: '10年健康险专家，免费咨询',
   *   card: myAgentCard,  // SDK auto-computes card_hash
   *   a2a_compatible: true,
   * });
   */
  async publish(options: {
    tags: string[];
    description: string;
    summary?: string;
    helpCommand?: string;
    card?: AgentCard;
    card_hash?: string;
    a2a_compatible?: boolean;
    a2a_endpoint?: string;
    autoHeartbeat?: boolean;
  }): Promise<{
    code: number;
    openid?: string;
    registered_at?: string;
  }> {
    const key = await this.createServiceKey();
    const openid = await this.getOpenId();
    this.l1.yellowPages.setIdentity(openid, key.signer, key.publicKey);

    // Auto-compute card_hash from card if provided
    let cardHash = options.card_hash;
    if (!cardHash && options.card) {
      cardHash = computeCardHash(options.card as unknown as Record<string, unknown>);
    }

    return this.l1.yellowPages.publish({
      tags: options.tags,
      description: options.description,
      summary: options.summary,
      help_command: options.helpCommand,
      card_hash: cardHash,
      a2a_compatible: options.a2a_compatible,
      a2a_endpoint: options.a2a_endpoint,
      autoHeartbeat: options.autoHeartbeat,
    });
  }

  /**
   * One-step unpublish from Yellow Pages.
   * Stops heartbeat and removes the entry.
   */
  async unpublish(): Promise<{ code: number }> {
    return this.l1.yellowPages.unpublish();
  }

  // Reputation convenience methods

  /**
   * Record a verifiable fact about an agent (trade, report, or service).
   * Requires setIdentity on the reputation client.
   */
  async recordReputationFact(params: {
    subjectOpenid: string;
    factType: 'trade' | 'report' | 'service';
    factSubtype: string;
    factData?: Record<string, unknown>;
    proof?: Record<string, unknown>;
  }): Promise<{ code: number }> {
    return this.l1.reputation.recordFact(params);
  }

  // Messaging convenience methods
  async send(toOpenid: string, content: string, opts?: SendOptions): Promise<void> {
    return this.messaging.send(toOpenid, content, opts);
  }

  async sendJson(toOpenid: string, data: object, opts?: SendOptions): Promise<void> {
    return this.messaging.sendJson(toOpenid, data, opts);
  }

  // Mailbox convenience methods
  async sync(sinceSeq?: number, limit?: number): Promise<Message[]> {
    return this.mailbox.sync(sinceSeq, limit);
  }

  startListening(
    onMessage: MessageHandler,
    options?: ListenOptions
  ): () => void {
    if (this.poller) this.poller.stop();

    // Let L1Dispatcher share the unified poller instead of spinning up its own
    this.l1Dispatcher?.setUseExternalPoller(true);

    this.poller = new AutoPollEngine(
      this.mailbox,
      async (msg: Message) => {
        // Route 0: AgentCard requests — auto-respond if handler registered
        if (this.agentCardHandler && msg.content) {
          try {
            const parsed = JSON.parse(msg.content);
            if (parsed.action === 'get_agent_card' && parsed.request_id) {
              try {
                const card = await this.agentCardHandler(parsed.requester_openid || msg.from_openid);
                const cardHash = computeCardHash(card as unknown as Record<string, unknown>);
                await this.messaging.sendJson(msg.from_openid, {
                  request_id: parsed.request_id,
                  code: 0,
                  data: { card, card_hash: cardHash },
                });
              } catch (e) {
                await this.messaging.sendJson(msg.from_openid, {
                  request_id: parsed.request_id,
                  code: -1,
                  msg: `AgentCard handler error: ${(e as Error).message}`,
                });
              }
              return; // consumed
            }
          } catch { /* not JSON or not a card request — fall through */ }
        }

        // Route 1: L1 request/response matching (dispatcher consumes the message)
        if (this.l1Dispatcher && this.l1Dispatcher.tryDispatch(msg)) return;

        // Route 2: user inbox — run through interceptor chain
        if (this.config.interceptor.enabled) {
          const ctx: InterceptorContext = {
            agentId: this.identity.getAgentId() || '',
            timestamp: Date.now(),
          };
          const result = await this.interceptors.process(msg, ctx);
          if (result.decision.action === 'block') return; // silent discard
          if (result.decision.action === 'flag') {
            (msg as Message & { flagged: boolean; flagReason: string }).flagged = true;
            (msg as Message & { flagged: boolean; flagReason: string }).flagReason = result.decision.reason;
          }
        }
        await onMessage(msg);
      },
      (err: Error) => { console.error('[oceanbus] listen error:', err.message); },
      options?.intervalMs ?? this.config.mailbox.pollIntervalMs
    );

    this.poller.start();
    return () => this.stopListening();
  }

  stopListening(): void {
    if (this.poller) {
      this.poller.stop();
      this.poller = null;
    }
    // Allow L1Dispatcher to create its own poller again for standalone use
    this.l1Dispatcher?.setUseExternalPoller(false);
  }

  // Blocklist convenience methods
  async blockSender(fromOpenid: string): Promise<void> {
    return this.blocklist.block(fromOpenid);
  }

  async unblockSender(fromOpenid: string): Promise<void> {
    return this.blocklist.unblock(fromOpenid);
  }

  isBlocked(fromOpenid: string): boolean {
    return this.blocklist.isBlocked(fromOpenid);
  }

  getBlocklist(): string[] {
    return this.blocklist.getBlocklist();
  }

  async reverseLookup(openid: string): Promise<{ real_agent_id: string }> {
    return this.blocklist.reverseLookup(openid);
  }

  // Lifecycle
  async destroy(): Promise<void> {
    // Best-effort deregister from Yellow Pages if identity was set
    if (this.l1 && this.l1.yellowPages && this.l1.yellowPages.hasIdentity()) {
      try {
        await this.l1.yellowPages.deregisterService();
      } catch {
        // Best effort — the entry will expire on its own (90-day TTL)
      }
    }

    // Destroy L1 dispatcher first (rejects pending requests, stops internal engine)
    if (this.l1Dispatcher) {
      this.l1Dispatcher.destroy();
      this.l1Dispatcher = null;
    }
    this.stopListening();
    await this.cursor.save();
    await this.blocklist.saveLocal();
    if (this.identity.getAgentId()) {
      await this.keyStore.save(this.identity.exportState());
    }
  }
}

export async function createOceanBus(config?: PartialConfig): Promise<OceanBus> {
  return OceanBus.create(config);
}

// Re-export all types
export * from './types';
export * from './client/errors';

// Re-export Roster for standalone use (without full OceanBus instance)
export { RosterService } from './roster/index';
export { RosterStore } from './roster/store';

// Re-export AgentCard utilities
export { computeCardHash, verifyCardHash, isValidCardHash } from './crypto/sha256';
