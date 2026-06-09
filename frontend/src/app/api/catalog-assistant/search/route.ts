import { NextRequest } from 'next/server';
import { getAdminSupabase, json } from '../../_lib/supabase-server';

const DEFAULT_LIMIT = 8;
const MAX_CONTEXT_PRODUCTS = 160;
const MIN_TEXT_SCORE = 2;
const DEAL_TERMS = new Set(['deal', 'deals', 'discount', 'discounts', 'discounted', 'promo', 'promos', 'sale', 'sales']);
const STOP_WORDS = new Set([
  'a', 'an', 'any', 'are', 'available', 'best', 'buy', 'can', 'catalog', 'catalogue',
  'do', 'for', 'from', 'get', 'have', 'i', 'im', 'in', 'item', 'items', 'looking',
  'me', 'need', 'on', 'option', 'options', 'our', 'product', 'products', 'related',
  'result', 'results', 'show', 'simba', 'something', 'store', 'supermarket', 'the',
  'to', 'please', 'find', 'search', 'want', 'with', 'your', 'you',
]);
const INTENT_HINTS: Record<string, string[]> = {
  breakfast: ['milk', 'bread', 'eggs', 'tea', 'coffee', 'cereal', 'oats', 'juice', 'jam', 'butter'],
  dairy: ['milk', 'yogurt', 'cheese'],
  milk: ['milk'],
  tea: ['tea', 'milk', 'sugar', 'biscuits'],
  coffee: ['coffee', 'milk', 'sugar', 'biscuits'],
  snack: ['biscuits', 'crisps', 'juice', 'soda', 'chocolate'],
  deals: ['discount', 'sale', 'promo'],
  essentials: ['soap', 'detergent', 'tissue', 'water', 'rice', 'oil'],
};

type ProductRow = {
  id: number;
  name: string;
  category?: string | null;
  brand?: string | null;
  description?: string | null;
  tags?: string[] | string | null;
  options?: string[] | string | null;
  addons?: string[] | string | null;
  modifiers?: string[] | string | null;
  in_stock?: boolean | null;
  out_of_stock?: boolean | null;
  rating?: number | null;
  discount?: number | null;
  on_sale?: boolean | null;
  best_seller?: boolean | null;
};

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

function baseTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2 && !STOP_WORDS.has(term)) || [];
}

function expandedTerms(query: string): string[] {
  const normalized = query.toLowerCase();
  const terms = [...baseTerms(query)];
  for (const [phrase, hints] of Object.entries(INTENT_HINTS)) {
    if (normalized.includes(phrase)) terms.push(...hints);
  }
  return Array.from(new Set(terms));
}

function haystack(product: ProductRow): string {
  return [
    product.name,
    product.category || '',
    product.brand || '',
    product.description || '',
    ...stringList(product.tags),
    ...stringList(product.options),
    ...stringList(product.addons),
    ...stringList(product.modifiers),
  ].join(' ').toLowerCase();
}

function scoreProduct(query: string, product: ProductRow): number {
  const text = haystack(product);
  if (!text) return 0;
  const tokens = new Set(text.match(/[a-z0-9]+/g) || []);
  let textScore = text.includes(query.trim().toLowerCase()) ? 8 : 0;

  for (const term of expandedTerms(query)) {
    if (tokens.has(term) || (term.length >= 4 && text.includes(term))) {
      textScore += 3;
    }
  }

  const genericDeal = /\b(deals?|discounts?|promos?|sale)\b/.test(query.toLowerCase())
    && baseTerms(query).every((term) => DEAL_TERMS.has(term));
  if (textScore < MIN_TEXT_SCORE && (!genericDeal || !((product.discount || 0) > 0 || product.on_sale))) {
    return 0;
  }

  return textScore
    + (product.in_stock && !product.out_of_stock ? 2 : 0)
    + ((product.rating || 0) >= 4.5 ? 1 : 0)
    + ((product.discount || 0) > 0 ? 1 : 0)
    + (product.best_seller ? 1 : 0);
}

function localMatches(query: string, catalog: ProductRow[], limit: number): ProductRow[] {
  return catalog
    .map((product) => ({ product, score: scoreProduct(query, product) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry) => entry.product);
}

async function askGroq(query: string, candidates: ProductRow[], localIds: number[], limit: number) {
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
            'You are Simba supermarket catalog search. Return JSON only: {"reply":"short answer","product_ids":[1,2]}. Select only relevant IDs from candidates. Never add unrelated products to fill the limit.',
        },
        {
          role: 'user',
          content: `Customer query: "${query}"\nLocal ranked IDs: ${localIds.join(', ') || 'none'}\nCatalog candidates:\n${catalog}`,
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
  try {
    const body = await request.json();
    const query = String(body.query || '').trim();
    const limit = Math.max(1, Math.min(Number(body.limit || DEFAULT_LIMIT), 12));
    if (!query) {
      return json({ message: 'Tell me what you need and I will suggest matching Simba products.', product_ids: [], source: 'local' });
    }

    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('product_catalog')
      .select('id,name,category,brand,description,tags,options,addons,modifiers,in_stock,out_of_stock,rating,discount,on_sale,best_seller')
      .eq('discontinued', false)
      .limit(1000);
    if (error) throw error;

    const catalog = (data || []) as ProductRow[];
    const candidates = localMatches(query, catalog, Math.max(limit, MAX_CONTEXT_PRODUCTS));
    const localIds = candidates.slice(0, limit).map((product) => Number(product.id));
    const ai = await askGroq(query, candidates, localIds, limit).catch(() => null);

    const candidateById = new Map(candidates.map((product) => [Number(product.id), product]));
    const aiIds = Array.isArray(ai?.product_ids)
      ? ai.product_ids
          .map((id: unknown) => Number(id))
          .filter((id: number) => Number.isFinite(id) && candidateById.has(id) && scoreProduct(query, candidateById.get(id)!) > 0)
      : [];
    const productIds = Array.from(new Set([...aiIds, ...localIds])).slice(0, limit);

    return json({
      message: typeof ai?.reply === 'string' && ai.reply.trim()
        ? ai.reply.trim()
        : productIds.length
          ? `I found ${productIds.length} Simba products related to "${query}".`
          : `I could not find a strong Simba match for "${query}" yet.`,
      product_ids: productIds,
      source: aiIds.length ? 'groq' : 'local',
    });
  } catch (error) {
    return json({ detail: error instanceof Error ? error.message : 'Catalog assistant search failed.' }, 500);
  }
}
