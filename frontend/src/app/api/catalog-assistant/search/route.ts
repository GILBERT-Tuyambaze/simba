import { NextRequest } from 'next/server';
import { getAdminSupabase, json } from '../../_lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  buildLocalConversationalMatches,
  buildSearchPlan,
  composeSimbaResponse,
  isProductRelevantToQuery,
} from '@/lib/simba-intelligence';
import type { Product } from '@/lib/types';

const DEFAULT_LIMIT = 8;
const MAX_CONTEXT_PRODUCTS = 160;

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

async function askGroq(query: string, candidates: Product[], localIds: number[], limit: number, branch?: string) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey || candidates.length === 0) return null;

  const catalog = candidates.slice(0, MAX_CONTEXT_PRODUCTS).map((product) => (
    `${product.id} | ${product.name} | category: ${product.category || '-'} | brand: ${product.brand || '-'} | tags: ${stringList(product.tags).join(', ') || '-'} | description: ${(product.description || '').slice(0, 120)}`
  )).join('\n');

  const response = await fetch(`${process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        {
          role: 'system',
          content:
            'You are Simba supermarket catalog search. Return JSON only: {"reply":"short answer","product_ids":[1,2]}. Select only relevant IDs from candidates. Never add unrelated products to fill the limit. Do not invent stock, policies, orders, or support answers.',
        },
        {
          role: 'user',
          content: `Customer query: "${query}"\nPreferred branch: ${branch || 'any'}\nLocal ranked IDs: ${localIds.join(', ') || 'none'}\nCatalog candidates:\n${catalog}`,
        },
      ],
    }),
  });

  if (!response.ok) return null;
  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || '';
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
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
    const plan = buildSearchPlan(query, branch || undefined);

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
    const candidates = buildLocalConversationalMatches(query, catalog, Math.max(limit, MAX_CONTEXT_PRODUCTS), branch);
    const localIds = candidates.slice(0, limit).map((product) => Number(product.id));
    const ai = await askGroq(query, candidates, localIds, limit, branch).catch(() => null);

    const candidateById = new Map(candidates.map((product) => [Number(product.id), product]));
    const aiIds = Array.isArray(ai?.product_ids)
      ? ai.product_ids
          .map((id: unknown) => Number(id))
          .filter((id: number) => {
            const product = candidateById.get(id);
            return Number.isFinite(id) && Boolean(product) && isProductRelevantToQuery(query, product!, branch);
          })
      : [];
    const productIds = Array.from(new Set([...aiIds, ...localIds])).slice(0, limit);
    const products = productIds
      .map((id) => candidateById.get(id))
      .filter((product): product is Product => Boolean(product));
    const composed = composeSimbaResponse(
      plan,
      products,
      aiIds.length ? 'groq' : 'local',
      typeof ai?.reply === 'string' && ai.reply.trim() ? ai.reply.trim() : undefined
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
