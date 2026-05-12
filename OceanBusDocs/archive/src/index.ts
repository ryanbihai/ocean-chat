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
import type { OceanBusConfig, PartialConfig } from './types/config';
import type { Message } from './types/messaging';
import type { ListenOptions, SendOptions } from './types/messaging';
import { OceanBusError } from './client/errors';

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
import type { Ed25519KeyPair, Certificate, CertVerifyResult, TrustAnchor } from './types/crypto';

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

// Quota
import { QuotaManager } from './quota/manager';

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

  _quota: QuotaManager;  // internal, exposed via getter

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
    this.messaging = new MessagingService(this.http, () => this.identity.getApiKey());

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

    // Quota
    this._quota = new QuotaManager(undefined, config.quota.dailyLimitWarnThreshold, config.quota.dailyLimit);

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

    // Load persisted identity if not provided via config
    if (!config.identity?.api_key) {
      const saved = await keyStore.load();
      if (saved) {
        ob.identity.fromState(saved);
      }
    }

    // Load persisted blocklist
    await ob.blocklist.loadLocal();

    // Load quota
    await ob._quota.load();

    // Load seq cursor
    await ob.cursor.load();

    // Set up shared L1 dispatcher — one polling engine for all L1 requests
    ob.l1Dispatcher = new L1Dispatcher(
      ob.mailbox,
      config.l1.requestTimeoutMs,
      config.l1.requestPollIntervalMs
    );

    // Validate Yellow Pages config
    const ypOpenid = config.l1.ypOpenids[0];
    if (!ypOpenid) {
      throw new OceanBusError(
        'Yellow Pages OpenID is not configured. Set config.l1.ypOpenids to the YP agent OpenID.'
      );
    }

    // Initialize L1 clients
    // L1 transport bypasses quota — infrastructure messages (heartbeat, CA, YP)
    // are not user messages and should not count toward daily limits
    const transport = {
      send: (to: string, content: string, cid?: string) => ob.messaging.send(to, content, cid),
      sendJson: (to: string, data: object, cid?: string) => ob.messaging.sendJson(to, data, cid),
    };

    ob.l1 = {
      yellowPages: new YellowPagesClient(
        transport,
        ypOpenid,
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
        '',
        ob.l1Dispatcher,
        config.l1.requestTimeoutMs
      ),
    };

    return ob;
  }

  // Identity convenience methods
  async register(): Promise<{ agent_id: string; api_key: string }> {
    const data = await this.identity.register();
    await this.keyStore.save(this.identity.toState());
    return data;
  }

  async whoami(): Promise<{ agent_id: string; openid: string }> {
    const data = await this.identity.whoami();
    return { agent_id: this.identity.getAgentId()!, openid: data.my_openid };
  }

  async getOpenId(): Promise<string> {
    return this.identity.getOpenId();
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

  // Messaging convenience methods
  async send(toOpenid: string, content: string, opts?: SendOptions): Promise<void> {
    // Quota check
    if (this.config.quota.enforceLocal) {
      const q = await this._quota.checkAndIncrement();
      if (!q.allowed) {
        throw new OceanBusError('Daily message quota exceeded');
      }
    }
    return this.messaging.send(toOpenid, content, opts?.clientMsgId);
  }

  async sendJson(toOpenid: string, data: object, opts?: SendOptions): Promise<void> {
    if (this.config.quota.enforceLocal) {
      const q = await this._quota.checkAndIncrement();
      if (!q.allowed) {
        throw new OceanBusError('Daily message quota exceeded');
      }
    }
    return this.messaging.sendJson(toOpenid, data, opts?.clientMsgId);
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

  // Quota convenience methods
  get quota(): { getDailyUsage: () => { used: number; limit: number; remaining: number }; resetDailyCount: () => Promise<void> } {
    return {
      getDailyUsage: () => this._quota.getUsage(),
      resetDailyCount: () => this._quota.reset(),
    };
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
    await this._quota.save();
    if (this.identity.getAgentId()) {
      await this.keyStore.save(this.identity.toState());
    }
  }
}

export async function createOceanBus(config?: PartialConfig): Promise<OceanBus> {
  return OceanBus.create(config);
}

// Re-export all types
export * from './types';
export * from './client/errors';
