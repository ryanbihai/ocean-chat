import type { Message } from '../types/messaging';

export interface InterceptorContext {
  agentId: string;
  timestamp: number;
  sessionCount?: number;
  [key: string]: unknown;
}

export type InterceptorDecision =
  | { action: 'pass' }
  | { action: 'flag'; reason: string; risk: 'low' | 'medium' | 'high' }
  | { action: 'block'; reason: string };

export interface MessageInterceptor {
  name: string;
  priority: number;
  evaluate(message: Message, context: InterceptorContext): Promise<InterceptorDecision>;
}

export class InterceptorChain {
  private interceptors: MessageInterceptor[] = [];

  register(interceptor: MessageInterceptor): void {
    this.interceptors.push(interceptor);
    // Sort by priority (higher runs first)
    this.interceptors.sort((a, b) => b.priority - a.priority);
  }

  remove(name: string): boolean {
    const idx = this.interceptors.findIndex((i) => i.name === name);
    if (idx === -1) return false;
    this.interceptors.splice(idx, 1);
    return true;
  }

  list(): ReadonlyArray<MessageInterceptor> {
    return this.interceptors;
  }

  async process(
    message: Message,
    context: InterceptorContext
  ): Promise<{ decision: InterceptorDecision; by: string }> {
    for (const interceptor of this.interceptors) {
      const decision = await interceptor.evaluate(message, context);
      if (decision.action === 'block' || decision.action === 'flag') {
        return { decision, by: interceptor.name };
      }
    }
    return { decision: { action: 'pass' }, by: 'default' };
  }
}
