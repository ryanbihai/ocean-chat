// L1 service communication protocol
// All L1 services are OceanBus agents — they communicate via L0 messaging

export interface L1Request {
  action: string;
  request_id: string;
  sig?: string;
  [key: string]: unknown;
}

/** L1Request with signature attached — used for all mutating operations after signing */
export interface SignedL1Request extends L1Request {
  sig: string;
}

export interface L1Response<T = unknown> {
  code: number;
  request_id: string;
  data?: T;
  error?: string;
  msg?: string;
}

/** Yellow Pages response codes */
export const YP_CODE = {
  OK: 0,
  SIG_INVALID: 1001,
  OPENID_EXISTS: 1002,
  MISSING_FIELDS: 1003,
  TAGS_TOO_LONG: 1004,
  DESCRIPTION_TOO_LONG: 1005,
  UUID_EXISTS: 1006,
  ENTRY_NOT_FOUND: 1007,
  SUMMARY_TOO_LONG: 1008,
  CARD_HASH_INVALID: 1009,
} as const;
export type YpCode = (typeof YP_CODE)[keyof typeof YP_CODE];

// ── AgentCard types for A2A compatibility ──

export interface Capability {
  id: string;
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  tags?: string[];
  rateLimit?: string;
  pricing?: {
    model: 'free' | 'per_call' | 'subscription' | 'negotiable';
    unitPrice?: string;
  };
}

export interface AgentCard {
  name: string;
  description: string;
  version?: string;
  provider?: { name: string; url?: string };
  icon?: string;
  capabilities: Capability[];
  oceanbus?: { openid: string; transport: 'oceanbus' };
  endpoints?: { http?: string; a2a_agent_card_url?: string };
}

export type AgentCardHandler = (requesterOpenid: string) => AgentCard | Promise<AgentCard>;

// Yellow Pages
export interface YpEntry {
  openid: string;
  tags: string[];
  description: string;
  summary?: string | null;
  help_command?: string | null;
  card_hash?: string | null;
  a2a_compatible?: boolean;
  a2a_endpoint?: string | null;
  review_status?: 'pending' | 'approved' | 'rejected' | 'flagged';
  review_reason?: string | null;
  registered_at?: string;
  updated_at?: string;
  last_heartbeat?: string;
}

/** High-level publish options — one call instead of createServiceKey + setIdentity + registerService + startHeartbeat */
export interface PublishOptions {
  tags: string[];
  description: string;
  summary?: string;
  help_command?: string;
  card_hash?: string;
  a2a_compatible?: boolean;
  a2a_endpoint?: string;
  autoHeartbeat?: boolean; // default true
}

export interface YpDiscoverRequest extends L1Request {
  action: 'discover';
  tags?: string[];
  limit?: number;
  cursor?: string | null;
  a2a_only?: boolean;
  format?: string;
}

export interface YpRegisterRequest extends L1Request {
  action: 'register_service';
  openid: string;
  tags: string[];
  description: string;
  public_key: string;
  card_hash?: string;
  summary?: string;
  a2a_compatible?: boolean;
  a2a_endpoint?: string;
}

export interface YpHeartbeatRequest extends L1Request {
  action: 'heartbeat';
  openid: string;
}

export interface YpUpdateRequest extends L1Request {
  action: 'update_service';
  openid: string;
  tags?: string[];
  description?: string;
  card_hash?: string;
  summary?: string;
  a2a_compatible?: boolean;
  a2a_endpoint?: string;
}

export interface YpVerifyCardRequest extends L1Request {
  action: 'verify_card';
  openid: string;
  card_hash: string;
}

export interface AgentCardRequestMessage {
  action: 'get_agent_card';
  request_id: string;
  requester_openid: string;
}

export interface YpDeregisterRequest extends L1Request {
  action: 'deregister_service';
  openid: string;
}

// CA actions
export interface CaApplyRequest extends L1Request {
  action: 'apply_cert';
  application: {
    subject_openid: string;
    subject_name: string;
    requested_level: 'bronze' | 'silver' | 'gold';
    contact_email: string;
    contact_person: string;
    contact_phone: string;
    business_scope: string;
    website?: string;
    supporting_documents?: Array<{ type: string; url: string; hash: string }>;
    public_key: string;
  };
}

export interface CaChallengeRequest extends L1Request {
  action: 'cert_challenge';
  application_id: string;
  challenge: {
    nonce: string;
    instruction: string;
    expires_in: number;
  };
}

export interface CaChallengeResponse extends L1Request {
  action: 'cert_challenge_response';
  application_id: string;
  signed_nonce: string;
}

export interface CaVerifyRequest extends L1Request {
  action: 'verify_cert';
  cert_id: string;
}

export interface CaCRLRequest extends L1Request {
  action: 'get_crl';
}

// Reputation actions
export interface ReputationTagRequest extends L1Request {
  action: 'tag';
  target_openid: string;
  label: string;
  evidence?: Record<string, unknown>;
  public_key: string;
}

export interface ReputationUntagRequest extends L1Request {
  action: 'untag';
  target_openid: string;
  label: string;
  public_key: string;
}

export interface ReputationRecordFactRequest extends L1Request {
  action: 'record_fact';
  subject_openid: string;
  fact_type: 'trade' | 'report' | 'service';
  fact_subtype: string;
  fact_data?: Record<string, unknown>;
  proof?: Record<string, unknown> | null;
  client_fact_id?: string;
  public_key: string;
}

export interface ReputationQueryRequest extends L1Request {
  action: 'query_reputation';
  openids: string[];
}

// ── Reputation Fact Model (宪法模式 — 5 类事实) ──

export interface IdentityFacts {
  registered_at: string | null;
  days_active: number;
  key_type: string;
}

export interface CommunicationFacts {
  messages_sent: number;
  messages_received: number;
  unique_partners: number;
  partners_30d: number;
}

export interface EvaluationFacts {
  tags: Record<string, number>;
  recent_tags: { label: string; from_openid?: string; applied_at?: string }[];
  unique_taggers: number;
}

export interface TradeFacts {
  contracts_total: number;
  contracts_fulfilled: number;
  contracts_broken: number;
  total_volume: number;
  recent_trades: { item: string; amount: number; timestamp: string }[];
}

export interface ReportFacts {
  filed_against: { type: string; reporter: string; timestamp: string; evidence?: unknown }[];
  /** 该 Agent 对别人发起的举报总数 */
  filed_by_this_agent: number;
}

export interface ServiceFacts {
  published_services: string[];
  uptime_days: number;
}

export interface ReputationFacts {
  identity: IdentityFacts;
  communication: CommunicationFacts;
  evaluations: EvaluationFacts;
  trade: TradeFacts;
  reports: ReportFacts;
  service: ServiceFacts;
}

export interface ReputationResult {
  openid: string;
  /** @deprecated — use facts.identity */
  total_sessions: number;
  /** @deprecated — use facts.identity */
  age_days: number;
  /** @deprecated — use facts.evaluations.tags */
  core_tags: Record<string, number>;
  /** @deprecated — use facts.evaluations.tags */
  free_tags: Record<string, number>;
  facts: ReputationFacts;
  error?: string;
}

// ── Payment Witness ──

export interface PaymentClaim {
  claim_id: string;
  payer_openid: string;
  payee_openid: string;
  amount: number;
  currency: string;
  chain?: string | null;
  tx_hash?: string | null;
  evidence?: string | null;
  description?: string | null;
  status: 'pending' | 'confirmed' | 'disputed' | 'expired';
  dispute_reason?: string | null;
  created_at: string;
  confirmed_at?: string | null;
}

export interface PaymentStats {
  total: number;
  confirmed: number;
  disputed: number;
  pending: number;
  total_amount: number;
}

export interface PaymentQueryResult {
  claims: PaymentClaim[];
  stats: PaymentStats;
  next_cursor: string | null;
}

export interface ClaimPaymentRequest extends L1Request {
  action: 'claim_payment';
  payer_openid: string;
  payee_openid: string;
  amount: number;
  currency: string;
  chain?: string;
  tx_hash?: string;
  evidence?: string;
  description?: string;
  public_key: string;
  claim_id?: string;
}

export interface ConfirmPaymentRequest extends L1Request {
  action: 'confirm_payment';
  claim_id: string;
  agreed: boolean;
  dispute_reason?: string;
  public_key: string;
}

export interface QueryPaymentsRequest extends L1Request {
  action: 'query_payments';
  openid: string;
  role?: 'payer' | 'payee';
  status?: string;
  limit?: number;
  cursor?: string | null;
}
