import { L1Client, L1Transport } from './base-client';
import type { L1Dispatcher } from './dispatcher';
import type {
  ReputationTagRequest,
  ReputationUntagRequest,
  ReputationQueryRequest,
  ReputationRecordFactRequest,
  ReputationResult,
  ClaimPaymentRequest,
  ConfirmPaymentRequest,
  QueryPaymentsRequest,
  PaymentQueryResult,
} from '../types/l1';
import type { L1Response } from '../types/l1';
import { OceanBusError } from '../client/errors';
import { generateRequestId } from '../messaging/idgen';

export type PayloadSigner = (payload: Record<string, unknown>) => Promise<string>;

export class ReputationClient extends L1Client {
  private defaultOpenid: string | null = null;
  private defaultSigner: PayloadSigner | null = null;
  private defaultPublicKey: string | null = null;

  constructor(
    sendFn: L1Transport,
    serviceOpenid: string,
    dispatcher?: L1Dispatcher,
    requestTimeoutMs: number = 30000
  ) {
    super(sendFn, serviceOpenid, dispatcher, requestTimeoutMs);
  }

  setIdentity(openid: string, signer: PayloadSigner, publicKey?: string): void {
    this.defaultOpenid = openid;
    this.defaultSigner = signer;
    if (publicKey !== undefined) this.defaultPublicKey = publicKey;
  }

  clearIdentity(): void {
    this.defaultOpenid = null;
    this.defaultSigner = null;
    this.defaultPublicKey = null;
  }

  private resolveIdentity(openid?: string, signer?: PayloadSigner, publicKey?: string) {
    const resolvedOpenid = openid ?? this.defaultOpenid;
    const resolvedSigner = signer ?? this.defaultSigner;
    const resolvedPublicKey = publicKey ?? this.defaultPublicKey;
    if (!resolvedOpenid || !resolvedSigner || !resolvedPublicKey) {
      throw new OceanBusError('openid, signer and publicKey are required — call setIdentity() or pass them explicitly');
    }
    return { openid: resolvedOpenid, signer: resolvedSigner, publicKey: resolvedPublicKey };
  }

  /** tag：打标签（核心标签或自由标签） */
  async tag(targetOpenid: string, label: string, evidence?: Record<string, unknown>, openid?: string, signer?: PayloadSigner, publicKey?: string): Promise<L1Response>;
  async tag(targetOpenid: string, label: string, evidence?: Record<string, unknown>, openid?: string, signer?: PayloadSigner, publicKey?: string): Promise<L1Response> {
    const id = this.resolveIdentity(openid, signer, publicKey);
    const payload: Omit<ReputationTagRequest, 'sig'> = {
      ...this.buildRequest('tag'),
      action: 'tag',
      target_openid: targetOpenid,
      label,
      public_key: id.publicKey,
    };
    if (evidence) payload.evidence = evidence;
    const sig = await id.signer(payload as Record<string, unknown>);
    return this.sendAction({ ...payload, sig } as ReputationTagRequest);
  }

  /** untag：撤销自己打过的标签 */
  async untag(targetOpenid: string, label: string, openid?: string, signer?: PayloadSigner, publicKey?: string): Promise<L1Response>;
  async untag(targetOpenid: string, label: string, openid?: string, signer?: PayloadSigner, publicKey?: string): Promise<L1Response> {
    const id = this.resolveIdentity(openid, signer, publicKey);
    const payload: Omit<ReputationUntagRequest, 'sig'> = {
      ...this.buildRequest('untag'),
      action: 'untag',
      target_openid: targetOpenid,
      label,
      public_key: id.publicKey,
    };
    const sig = await id.signer(payload as Record<string, unknown>);
    return this.sendAction({ ...payload, sig } as ReputationUntagRequest);
  }

  /** recordFact：记录客观事实（由 L1 服务或系统调用）。提供 clientFactId 可防重复记录。 */
  async recordFact(params: {
    subjectOpenid: string;
    factType: 'trade' | 'report' | 'service';
    factSubtype: string;
    factData?: Record<string, unknown>;
    proof?: Record<string, unknown>;
    clientFactId?: string;
  }, openid?: string, signer?: PayloadSigner, publicKey?: string): Promise<L1Response> {
    const id = this.resolveIdentity(openid, signer, publicKey);
    const payload: Omit<ReputationRecordFactRequest, 'sig'> = {
      action: 'record_fact',
      request_id: generateRequestId(),
      subject_openid: params.subjectOpenid,
      fact_type: params.factType,
      fact_subtype: params.factSubtype,
      fact_data: params.factData || {},
      proof: params.proof || null,
      public_key: id.publicKey,
    };
    if (params.clientFactId) payload.client_fact_id = params.clientFactId;
    const sig = await id.signer(payload as Record<string, unknown>);
    return this.sendAction({ ...payload, sig } as ReputationRecordFactRequest);
  }

  /** queryReputation：查询声誉——返回 5 类事实 + 标签计数 + Agent 基本数据 */
  async queryReputation(openids: string[]): Promise<L1Response<{ results: ReputationResult[] }>> {
    const request: ReputationQueryRequest = {
      ...this.buildRequest('query_reputation'),
      action: 'query_reputation',
      openids,
    };
    return this.sendAction(request) as Promise<L1Response<{ results: ReputationResult[] }>>;
  }

  // ── Payment Witness ──

  /** claimPayment：付款方声明支付 */
  async claimPayment(params: {
    payeeOpenid: string;
    amount: number;
    currency: string;
    chain?: string;
    txHash?: string;
    evidence?: string;
    description?: string;
    claimId?: string;
  }, openid?: string, signer?: PayloadSigner, publicKey?: string): Promise<L1Response<{ claim_id: string; status: string }>> {
    const id = this.resolveIdentity(openid, signer, publicKey);
    const payload: Record<string, unknown> = {
      ...this.buildRequest('claim_payment'),
      action: 'claim_payment',
      payer_openid: id.openid,
      payee_openid: params.payeeOpenid,
      amount: params.amount,
      currency: params.currency,
      public_key: id.publicKey,
    };
    if (params.chain) payload.chain = params.chain;
    if (params.txHash) payload.tx_hash = params.txHash;
    if (params.evidence) payload.evidence = params.evidence;
    if (params.description) payload.description = params.description;
    if (params.claimId) payload.claim_id = params.claimId;

    const sig = await id.signer(payload);
    return this.sendAction({ ...payload, sig } as ClaimPaymentRequest) as Promise<L1Response<{ claim_id: string; status: string }>>;
  }

  /** confirmPayment：收款方确认/否认支付 */
  async confirmPayment(params: {
    claimId: string;
    agreed: boolean;
    disputeReason?: string;
  }, openid?: string, signer?: PayloadSigner, publicKey?: string): Promise<L1Response<{ claim_id: string; status: string }>> {
    const id = this.resolveIdentity(openid, signer, publicKey);
    const payload: Record<string, unknown> = {
      ...this.buildRequest('confirm_payment'),
      action: 'confirm_payment',
      claim_id: params.claimId,
      agreed: params.agreed,
      public_key: id.publicKey,
    };
    if (params.disputeReason) payload.dispute_reason = params.disputeReason;

    const sig = await id.signer(payload);
    return this.sendAction({ ...payload, sig } as ConfirmPaymentRequest) as Promise<L1Response<{ claim_id: string; status: string }>>;
  }

  /** queryPayments：查询支付记录 */
  async queryPayments(params: {
    openid: string;
    role?: 'payer' | 'payee';
    status?: string;
    limit?: number;
    cursor?: string | null;
  }): Promise<L1Response<PaymentQueryResult>> {
    const request: QueryPaymentsRequest = {
      ...this.buildRequest('query_payments'),
      action: 'query_payments',
      openid: params.openid,
    };
    if (params.role) request.role = params.role;
    if (params.status) request.status = params.status;
    if (params.limit) request.limit = params.limit;
    if (params.cursor) request.cursor = params.cursor;

    return this.sendAction(request) as Promise<L1Response<PaymentQueryResult>>;
  }
}
