import type { Product } from '@/lib/types';
import {
  buildLocalConversationalResult,
  type AssistantAction,
  type RecipePlan,
  type ShoppingPlan,
  type SimbaSearchPlan,
} from './queryPlanner';

export type SimbaResponseSource = 'local' | 'groq' | 'planner';

export type SimbaResponse = {
  intent: SimbaSearchPlan['intent'];
  mode: SimbaSearchPlan['mode'];
  source: SimbaResponseSource;
  query: string;
  branch?: string;
  products: Product[];
  productIds: number[];
  supportReply?: string;
  supportUrl?: string;
  message: string;
  explanation: string;
  suggestions: string[];
  confidence: number;
  actions: AssistantAction[];
  recipe?: RecipePlan;
  shoppingPlan?: ShoppingPlan;
  pageHint?: string;
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
  const localResult = buildLocalConversationalResult(plan.query, products, products.length || 8, plan.branch);

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
        : supportReply ?? `I'm here to help you find the best groceries and meal ideas at Simba. I couldn't find an exact match for that, but I can help with substitutes or nearby categories. What else are you looking for today?`;

  const actions = [
    ...(plan.actions || []),
    ...(localResult.actions || []),
  ];

  return {
    intent: plan.intent,
    mode: plan.mode,
    source,
    query: plan.query,
    branch: plan.branch,
    products,
    productIds,
    supportReply,
    supportUrl,
    message,
    explanation: plan.explanation,
    suggestions,
    confidence: plan.confidence,
    actions,
    recipe: plan.recipe || localResult.recipe,
    shoppingPlan: plan.shoppingPlan || localResult.shoppingPlan,
    pageHint: plan.pageHint,
  };
}
