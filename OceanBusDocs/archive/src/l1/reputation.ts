import { L1Client, L1Transport } from './base-client';
import type { L1Dispatcher } from './dispatcher';
import type {
  ReputationSubmitTag,
  ReputationFraudReport,
  ReputationSpamReport,
  ReputationQueryRequest,
  ReputationQuery,
} from '../types/l1';
import type { L1Response } from '../types/l1';

export class ReputationClient extends L1Client {
  constructor(
    sendFn: L1Transport,
    serviceOpenid: string,
    dispatcher?: L1Dispatcher,
    requestTimeoutMs: number = 30000
  ) {
    super(sendFn, serviceOpenid, dispatcher, requestTimeoutMs);
  }

  async submitTag(targetOpenid: string, tag: string, sig: string): Promise<L1Response> {
    const request: ReputationSubmitTag = {
      ...this.buildRequest('submit_tag'),
      action: 'submit_tag',
      target_openid: targetOpenid,
      tag,
      sig,
    };
    return this.sendAction(request);
  }

  async fraudReport(targetOpenid: string, evidence: string, sig: string): Promise<L1Response> {
    const request: ReputationFraudReport = {
      ...this.buildRequest('fraud_report'),
      action: 'fraud_report',
      target_openid: targetOpenid,
      evidence,
      sig,
    };
    return this.sendAction(request);
  }

  async spamReport(targetOpenid: string, sig: string): Promise<L1Response> {
    const request: ReputationSpamReport = {
      ...this.buildRequest('spam_report'),
      action: 'spam_report',
      target_openid: targetOpenid,
      sig,
    };
    return this.sendAction(request);
  }

  async queryReputation(openids: string[]): Promise<L1Response<{ reputations: ReputationQuery[] }>> {
    const request: ReputationQueryRequest = {
      ...this.buildRequest('query_reputation'),
      action: 'query_reputation',
      openids,
    };
    return this.sendAction(request) as Promise<L1Response<{ reputations: ReputationQuery[] }>>;
  }
}
