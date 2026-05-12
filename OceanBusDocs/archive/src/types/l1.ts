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
} as const;
export type YpCode = (typeof YP_CODE)[keyof typeof YP_CODE];

// Yellow Pages
export interface YpEntry {
  openid: string;
  tags: string[];
  description: string;
  registered_at?: string;
  updated_at?: string;
  last_heartbeat?: string;
}

export interface YpDiscoverRequest extends L1Request {
  action: 'discover';
  tags?: string[];
  limit?: number;
  cursor?: string | null;
}

export interface YpRegisterRequest extends L1Request {
  action: 'register_service';
  openid: string;
  tags: string[];
  description: string;
  public_key: string;
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
export interface ReputationTag {
  tag: string;
  sig: string;
  timestamp: string;
}

export interface ReputationQuery {
  openid: string;
  tags: ReputationTag[];
  permanent_flags: string[];
  ca_level: string;
  total_sessions: number;
  age_days: number;
}

export interface ReputationSubmitTag extends L1Request {
  action: 'submit_tag';
  target_openid: string;
  tag: string;
}

export interface ReputationFraudReport extends L1Request {
  action: 'fraud_report';
  target_openid: string;
  evidence: string;
}

export interface ReputationSpamReport extends L1Request {
  action: 'spam_report';
  target_openid: string;
}

export interface ReputationQueryRequest extends L1Request {
  action: 'query_reputation';
  openids: string[];
}

export interface ReputationQueryResponse extends L1Response<{
  reputations: ReputationQuery[];
}> {}
