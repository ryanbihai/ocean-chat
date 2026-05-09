import type { MessageInterceptor, InterceptorContext, InterceptorDecision } from './chain';
import type { Message } from '../types/messaging';

export type LLMEvaluatorFn = (
  message: Message,
  context: InterceptorContext
) => Promise<InterceptorDecision>;

export class LLMInterceptor implements MessageInterceptor {
  name = 'llm-security-scanner';
  priority = 100;
  private evaluator: LLMEvaluatorFn;

  constructor(evaluator: LLMEvaluatorFn) {
    this.evaluator = evaluator;
  }

  async evaluate(message: Message, context: InterceptorContext): Promise<InterceptorDecision> {
    return this.evaluator(message, context);
  }
}

// Default system prompt for LLM-based fraud detection
export const DEFAULT_SECURITY_PROMPT = `你是主人的本地反诈安全守卫。请分析以下解密信息。如果其中包含明显的"无担保交易要求"、"钓鱼外部链接"、"冒充官方客服"等典型欺诈特征，请直接返回 [BLOCK]，并在本地静默销毁该消息。`;

// No-op evaluator that passes everything (default when no LLM configured)
export const noopEvaluator: LLMEvaluatorFn = async () => ({ action: 'pass' });
