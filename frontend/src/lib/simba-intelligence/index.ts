import { composeSimbaResponse, type SimbaResponse } from './responseComposer';
import { appendSimbaMessage, clearSimbaHistory, createSimbaContext, getBranchFromContext, getUserRole, type SimbaContext, type SimbaConversationMessage, type SimbaUserContext } from './contextManager';
import { buildSearchPlan, buildLocalConversationalMatches, buildLocalConversationalResult, isProductRelevantToQuery, type RankingStrategy, type SimbaSearchPlan } from './queryPlanner';
import { classifyIntent, getSupportResponse, type SimbaIntent } from './intentClassifier';
import type { Product } from '@/lib/types';

const DEFAULT_LIMIT = 8;

export {
  classifyIntent,
  getSupportResponse,
  type SimbaIntent,
  buildSearchPlan,
  buildLocalConversationalMatches,
  buildLocalConversationalResult,
  isProductRelevantToQuery,
  type RankingStrategy,
  type SimbaSearchPlan,
  composeSimbaResponse,
  createSimbaContext,
  appendSimbaMessage,
  clearSimbaHistory,
  getUserRole,
  getBranchFromContext,
  type SimbaContext,
  type SimbaConversationMessage,
  type SimbaUserContext,
  type SimbaResponse,
};

export async function runSimbaSearch(
  query: string,
  products: Product[],
  limit: number = DEFAULT_LIMIT,
  branch?: string
): Promise<SimbaResponse> {
  const plan = buildSearchPlan(query, branch);
  const localMatches = buildLocalConversationalMatches(query, products, limit, branch);
  const localResponse = composeSimbaResponse(plan, localMatches, 'local');

  if (!query.trim() || products.length === 0) {
    return localResponse;
  }

  const requestId = `${query.trim().toLowerCase()}:${limit}`;
  try {
    const response = await fetch('/api/catalog-assistant/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        request_id: requestId,
        branch,
      }),
    });

    if (!response.ok) {
      throw new Error(`Catalog assistant request failed (${response.status})`);
    }

    const data = await response.json();
    const rawProductIds = Array.isArray(data?.product_ids) ? data.product_ids : [];
    const productMap = new Map(products.map((product) => [product.id, product]));
    const matchedProducts = rawProductIds
      .map((id: unknown) => {
        const numericId = typeof id === 'number' ? id : Number(id);
        return Number.isFinite(numericId) ? productMap.get(numericId) || null : null;
      })
      .filter((product: Product | null): product is Product => Boolean(product))
      .filter((product: Product) => isProductRelevantToQuery(query, product, branch));

    const finalProducts = matchedProducts.length > 0 ? matchedProducts : localMatches;
    const overrideMessage =
      matchedProducts.length > 0 && typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : undefined;

    return composeSimbaResponse(
      plan,
      finalProducts,
      matchedProducts.length > 0 ? 'groq' : 'local',
      overrideMessage,
      {
        supportReply: typeof data?.support_reply === 'string' ? data.support_reply : localResponse.supportReply,
        supportUrl: typeof data?.support_url === 'string' ? data.support_url : localResponse.supportUrl,
      }
    );
  } catch {
    return localResponse;
  }
}
