import { L1Client, L1Transport } from './base-client';
import type { L1Dispatcher } from './dispatcher';
import type {
  CaApplyRequest,
  CaChallengeResponse,
  CaVerifyRequest,
  CaCRLRequest,
} from '../types/l1';
import type { L1Response } from '../types/l1';
import type { Certificate, TrustAnchor, CertVerifyResult } from '../types/crypto';
import { verify, hexToBuffer } from '../crypto';

export class CAClient extends L1Client {
  private trustedCAs: Map<string, Map<string, Uint8Array>>;

  constructor(
    sendFn: L1Transport,
    serviceOpenid: string,
    trustedCAs: TrustAnchor[] = [],
    dispatcher?: L1Dispatcher,
    requestTimeoutMs: number = 30000
  ) {
    super(sendFn, serviceOpenid, dispatcher, requestTimeoutMs);
    this.trustedCAs = new Map();

    for (const ca of trustedCAs) {
      const keyMap = new Map<string, Uint8Array>();
      for (const key of ca.keys) {
        if (key.status === 'active') {
          keyMap.set(key.key_id, hexToBuffer(key.public_key.replace('ed25519:', '')));
        }
      }
      this.trustedCAs.set(ca.issuer, keyMap);
    }
  }

  addTrustAnchor(anchor: TrustAnchor): void {
    const keyMap = new Map<string, Uint8Array>();
    for (const key of anchor.keys) {
      if (key.status === 'active') {
        keyMap.set(key.key_id, hexToBuffer(key.public_key.replace('ed25519:', '')));
      }
    }
    this.trustedCAs.set(anchor.issuer, keyMap);
  }

  async applyCert(application: CaApplyRequest['application']): Promise<L1Response> {
    const request: CaApplyRequest = {
      ...this.buildRequest('apply_cert'),
      action: 'apply_cert',
      application,
    };
    return this.sendAction(request);
  }

  async challengeResponse(applicationId: string, signedNonce: string): Promise<L1Response> {
    const request: CaChallengeResponse = {
      ...this.buildRequest('cert_challenge_response'),
      action: 'cert_challenge_response',
      application_id: applicationId,
      signed_nonce: signedNonce,
    };
    return this.sendAction(request);
  }

  async verifyCertOnline(certId: string): Promise<L1Response> {
    const request: CaVerifyRequest = {
      ...this.buildRequest('verify_cert'),
      action: 'verify_cert',
      cert_id: certId,
    };
    return this.sendAction(request);
  }

  async getCRL(): Promise<L1Response> {
    const request: CaCRLRequest = {
      ...this.buildRequest('get_crl'),
      action: 'get_crl',
    };
    return this.sendAction(request);
  }

  async verifyCertificateOffline(certificate: Certificate): Promise<CertVerifyResult> {
    try {
      const issuerKeys = this.trustedCAs.get(certificate.cert.issuer);
      if (!issuerKeys) {
        return { valid: false, error: `Unknown CA issuer: ${certificate.cert.issuer}` };
      }

      const caPk = issuerKeys.get(certificate.cert.issuer_key_id);
      if (!caPk) {
        return { valid: false, error: `Unknown CA key_id: ${certificate.cert.issuer_key_id}` };
      }

      const valid = await verify(caPk, certificate.cert as unknown as Record<string, unknown>, certificate.sig);
      if (!valid) {
        return { valid: false, error: 'Signature verification failed' };
      }

      const now = new Date();
      const expires = new Date(certificate.cert.expires_at);
      if (isNaN(expires.getTime())) {
        return { valid: false, error: 'Invalid expiry date' };
      }
      if (now > expires) {
        return { valid: false, error: 'Certificate expired' };
      }

      return { valid: true, level: certificate.cert.level };
    } catch (err) {
      return { valid: false, error: (err as Error).message };
    }
  }
}
