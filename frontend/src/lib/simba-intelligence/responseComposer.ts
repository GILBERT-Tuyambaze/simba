import type { Product } from '@/lib/types';
import type { SimbaSearchPlan } from './queryPlanner';

export type SimbaResponseSource = 'local' | 'groq' | 'planner';

export type SimbaResponse = {
  intent: SimbaSearchPlan['intent'];
  source: SimbaResponseSource;
  query: string;
  products: Product[];
  productIds: number[];
  supportReply?: string;
  supportUrl?: string;
  message: string;
  explanation: string;
  suggestions: string[];
  confidence: number;
};

export function composeSimbaResponse(
  plan: SimbaSearchPlan,
  products: Product[],
  source: SimbaResponseSource,
  messageOverride?: string,
  supportOverride?: { supportReply?: string; supportUrl?: string }
): SimbaResponse {
  const productIds = products.map((product) => product.id);
  const branchMessage = plan.branch ? ` available at ${plan.branch}` : '';

  const supportReply = supportOverride?.supportReply ?? plan.supportReply;
  const supportUrl = supportOverride?.supportUrl ?? plan.supportUrl;
  const suggestions = plan.confidence < 0.7
    ? [...plan.suggestions, 'Contact support for help']
    : plan.suggestions;

  const message =
    typeof messageOverride === 'string' && messageOverride.trim()
      ? messageOverride.trim()
      : products.length > 0
        ? `I found ${products.length} Simba products${branchMessage} related to "${plan.query}".`
        : supportReply ?? `I could not find a strong Simba match for "${plan.query}" yet. Try a more specific product or meal idea.`;

  return {
    intent: plan.intent,
    source,
    query: plan.query,
    products,
    productIds,
    supportReply,
    supportUrl,
    message,
    explanation: plan.explanation,
    suggestions,
    confidence: plan.confidence,
  };
}
