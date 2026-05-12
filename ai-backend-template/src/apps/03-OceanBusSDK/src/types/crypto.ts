export interface Ed25519KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export interface SignedPayload {
  payload: Record<string, unknown>;
  sig: string;
}

export interface CertData {
  issuer: string;
  issuer_key_id: string;
  subject_openid: string;
  subject_name: string;
  level: 'bronze' | 'silver' | 'gold';
  issued_at: string;
  expires_at: string;
}

export interface Certificate {
  cert: CertData;
  sig: string;
}

export interface CertVerifyResult {
  valid: boolean;
  level?: 'bronze' | 'silver' | 'gold';
  error?: string;
}

export interface TrustAnchorKey {
  key_id: string;
  public_key: string;
  status: 'active' | 'rotated';
}

export interface TrustAnchor {
  issuer: string;
  display_name?: string;
  keys: TrustAnchorKey[];
  ca_openid?: string;
  website?: string;
}
