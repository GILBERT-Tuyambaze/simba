import { NextRequest } from 'next/server';
import { getAdminSupabase, json } from '../../_lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  buildLocalConversationalMatches,
  buildSearchPlan,
  composeSimbaResponse,
  type SimbaAssistantContext,
} from '@/lib/simba-intelligence';
import { runGroqCopilotV3 } from '@/lib/simba-intelligence/groqCopilot';
import type { CartItem } from '@/lib/types';
import type { Product } from '@/lib/types';

const DEFAULT_LIMIT = 8;
const MAX_CONTEXT_PRODUCTS = 160;

function parseCartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => item as Partial<CartItem>)
    .filter((item) => Number.isFinite(Number(item.product_id)) && typeof item.product_name === 'string')
    .map((item) => ({
      product_id: Number(item.product_id),
      product_name: String(item.product_name),
      price: Number(item.price || 0),
      image: String(item.image || ''),
      quantity: Math.max(1, Number(item.quantity || 1)),
      branch: item.branch ? String(item.branch) : undefined,
      unit: item.unit ? String(item.unit) : undefined,
      max_quantity: Number.isFinite(Number(item.max_quantity)) ? Number(item.max_quantity) : undefined,
    }))
    .slice(0, 40);
}

function parseHistory(value: unknown): SimbaAssistantContext['history'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => item as { role?: unknown; text?: unknown; query?: unknown })
    .filter((item) => (item.role === 'assistant' || item.role === 'user') && typeof item.text === 'string')
    .map((item, index) => ({
      id: `api-history-${index}`,
      role: item.role as 'assistant' | 'user',
      text: String(item.text).slice(0, 1200),
      query: typeof item.query === 'string' ? item.query : undefined,
    }))
    .slice(-12);
}

function parseStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

function parseNumberList(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(Number).filter(Number.isFinite).slice(0, 20);
}

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    route: '/api/catalog-assistant/search',
    maxRequests: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return json(
      { detail: 'Too many search requests. Please wait a moment and try again.' },
      429,
    );
  }

  try {
    const body = await request.json();
    const query = String(body.query || '').trim();
    const limit = Math.max(1, Math.min(Number(body.limit || DEFAULT_LIMIT), 12));
    const branch = typeof body.branch === 'string' ? body.branch.trim() : '';
    const cartItems = parseCartItems(body.cart_items);
    const history = parseHistory(body.history);
    const context: SimbaAssistantContext = {
      branch: branch || undefined,
      pageType: typeof body.page_type === 'string' ? body.page_type : undefined,
      pageTitle: typeof body.page_title === 'string' ? body.page_title : undefined,
      productId: Number.isFinite(Number(body.product_id)) ? Number(body.product_id) : undefined,
      categoryId: body.category_id ?? undefined,
      branchId: body.branch_id ?? undefined,
      cartSummary: typeof body.cart_summary === 'string' ? body.cart_summary : undefined,
      currentUserRole: typeof body.current_user_role === 'string' ? body.current_user_role : undefined,
      history,
      cartItems,
    };
    const plan = buildSearchPlan(query, branch || undefined, undefined, context);

    if (!query) {
      const response = composeSimbaResponse(
        plan,
        [],
        'planner',
        'Tell me what you need and I will suggest matching Simba products.'
      );
      return json({
        message: response.message,
        product_ids: [],
        source: response.source,
        intent: response.intent,
        confidence: response.confidence,
        explanation: response.explanation,
        suggestions: response.suggestions,
      });
    }

    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('product_catalog')
      .select('id,name,price,category,image,unit,brand,description,tags,options,addons,modifiers,branch_stock,stock_count,in_stock,out_of_stock,rating,discount,on_sale,best_seller,discontinued')
      .eq('discontinued', false)
      .limit(1000);
    if (error) throw error;

    const catalog = (data || []) as Product[];
    const copilot = await runGroqCopilotV3({
      query,
      catalog,
      limit,
      branch: branch || undefined,
      context: {
        ...context,
        memory: body.memory && typeof body.memory === 'object' ? body.memory : undefined,
        user: body.user && typeof body.user === 'object' ? body.user : undefined,
      },
      cartItems,
      history,
      lastViewedProducts: parseNumberList(body.last_viewed_products),
      recentSearches: parseStringList(body.recent_searches),
    }).catch(() => null);

    if (copilot) {
      return json({
        message: copilot.message,
        product_ids: copilot.productIds,
        source: 'groq-v3',
        intent: copilot.intent,
        mode: copilot.mode,
        confidence: copilot.confidence,
        explanation: copilot.explanation,
        suggestions: copilot.suggestions,
        actions: copilot.actions,
        recipe: copilot.recipe,
        shopping_plan: copilot.shoppingPlan,
        support_reply: copilot.supportReply,
        support_url: copilot.supportUrl,
        stages: {
          nlu: copilot.nlu,
          retrieval_instructions: copilot.retrievalInstructions,
          evaluations: copilot.evaluations.slice(0, 12),
          reasoning: copilot.reasoning,
        },
      });
    }

    const candidates = buildLocalConversationalMatches(query, catalog, Math.max(limit, MAX_CONTEXT_PRODUCTS), branch, context);
    const localIds = candidates.slice(0, limit).map((product) => Number(product.id));
    const candidateById = new Map(candidates.map((product) => [Number(product.id), product]));
    const productIds = Array.from(new Set(localIds)).slice(0, limit);
    const products = productIds
      .map((id) => candidateById.get(id))
      .filter((product): product is Product => Boolean(product));
    const composed = composeSimbaResponse(
      plan,
      products,
      'local'
    );

    return json({
      message: composed.message,
      product_ids: composed.productIds,
      source: composed.source,
      intent: composed.intent,
      confidence: composed.confidence,
      explanation: composed.explanation,
      suggestions: composed.suggestions,
      support_reply: composed.supportReply,
      support_url: composed.supportUrl,
    });
  } catch (error) {
    return json({ detail: error instanceof Error ? error.message : 'Catalog assistant search failed.' }, 500);
  }
}
