import type { Product } from './types';

export type ConversationalSearchResult = {
  message: string;
  products: Product[];
  productIds: number[];
  source: 'groq' | 'local';
};

const DEFAULT_LIMIT = 8;
const MIN_TEXT_SCORE = 2;
const DEAL_TERMS = new Set(['deal', 'deals', 'discount', 'discounts', 'discounted', 'promo', 'promos', 'sale', 'sales']);
const INTENT_HINTS: Record<string, string[]> = {
  breakfast: ['milk', 'bread', 'eggs', 'tea', 'coffee', 'cereal', 'oats', 'juice', 'jam', 'butter'],
  dairy: ['milk', 'yogurt', 'cheese'],
  'fresh milk': ['milk'],
  milk: ['milk'],
  tea: ['tea', 'milk', 'sugar', 'biscuits'],
  coffee: ['coffee', 'milk', 'sugar', 'biscuits'],
  snack: ['biscuits', 'crisps', 'juice', 'soda', 'chocolate'],
  deals: ['discount', 'sale', 'promo'],
  deal: ['discount', 'sale', 'promo'],
  essentials: ['soap', 'detergent', 'tissue', 'water', 'rice', 'oil'],
};
const STOP_WORDS = new Set([
  'a',
  'an',
  'any',
  'are',
  'available',
  'best',
  'buy',
  'can',
  'catalog',
  'catalogue',
  'do',
  'for',
  'from',
  'get',
  'have',
  'i',
  "i'm",
  'im',
  'in',
  'item',
  'items',
  'looking',
  'me',
  'need',
  'on',
  'option',
  'options',
  'our',
  'product',
  'products',
  'related',
  'result',
  'results',
  'show',
  'simba',
  'something',
  'store',
  'supermarket',
  'the',
  'to',
  'please',
  'find',
  'search',
  'want',
  'with',
  'your',
  'you',
]);

function normalizeStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map(String).map((item) => item.trim()).filter(Boolean);
      }
    } catch {
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function expandQueryTerms(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  const baseTerms = getBaseQueryTerms(query);
  const expanded = [...baseTerms];

  Object.entries(INTENT_HINTS).forEach(([phrase, hints]) => {
    if (normalized.includes(phrase)) {
      expanded.push(...hints);
    }
  });

  return Array.from(new Set(expanded));
}

function getBaseQueryTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .match(/[a-z0-9]+/g)
    ?.filter((term) => term.length > 2 && !STOP_WORDS.has(term)) || [];
}

function hasSpecificProductIntent(query: string): boolean {
  return getBaseQueryTerms(query).some((term) => !DEAL_TERMS.has(term));
}

function buildProductHaystack(product: Product): string {
  return [
    product.name,
    product.category,
    product.brand || '',
    product.description || '',
    ...normalizeStringList(product.tags),
    ...normalizeStringList(product.options),
    ...normalizeStringList(product.addons),
    ...normalizeStringList(product.modifiers),
  ]
    .join(' ')
    .toLowerCase();
}

function tokenize(text: string): Set<string> {
  return new Set(text.match(/[a-z0-9]+/g) || []);
}

function termsMatch(term: string, tokens: Set<string>, haystack: string): boolean {
  if (tokens.has(term)) {
    return true;
  }

  if (term.length >= 4) {
    for (const token of tokens) {
      if (token.startsWith(term) || term.startsWith(token)) {
        return true;
      }
    }
  }

  return term.length >= 4 && haystack.includes(term);
}

function isDealIntent(query: string): boolean {
  const normalized = query.trim().toLowerCase();
  return /\b(deals?|discounts?|promos?|sale)\b/.test(normalized);
}

function scoreProduct(query: string, product: Product): number {
  const normalizedQuery = query.trim().toLowerCase();
  const haystack = buildProductHaystack(product);
  if (!haystack) {
    return 0;
  }

  const tokens = tokenize(haystack);
  const terms = expandQueryTerms(query);
  let textScore = normalizedQuery && haystack.includes(normalizedQuery) ? 8 : 0;

  for (const term of terms) {
    if (termsMatch(term, tokens, haystack)) {
      textScore += 3;
    }
  }

  if (textScore < MIN_TEXT_SCORE) {
    const isGenericDealQuery = isDealIntent(query) && !hasSpecificProductIntent(query);
    if (!isGenericDealQuery || !((product.discount || 0) > 0 || product.on_sale)) {
      return 0;
    }
  }

  const qualityScore =
    (product.in_stock && !product.out_of_stock ? 2 : 0)
    + ((product.rating || 0) >= 4.5 ? 1 : 0)
    + ((product.discount || 0) > 0 ? 1 : 0)
    + (product.best_seller ? 1 : 0);

  return textScore + qualityScore;
}

export function isProductRelevantToQuery(query: string, product: Product): boolean {
  return scoreProduct(query, product) > 0;
}

export function buildLocalConversationalMatches(
  query: string,
  products: Product[],
  limit: number = DEFAULT_LIMIT
): Product[] {
  return [...products]
    .map((product) => {
      return { product, score: scoreProduct(query, product) };
    })
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score
        || Number(Boolean(b.product.in_stock)) - Number(Boolean(a.product.in_stock))
        || (b.product.rating || 0) - (a.product.rating || 0)
        || (b.product.discount || 0) - (a.product.discount || 0)
    )
    .slice(0, limit)
    .map((entry) => entry.product);
}

export function buildLocalConversationalResult(
  query: string,
  products: Product[],
  limit: number = DEFAULT_LIMIT
): ConversationalSearchResult {
  const matches = buildLocalConversationalMatches(query, products, limit);

  return {
    message:
      matches.length > 0
        ? `I found ${matches.length} Simba products related to "${query}".`
        : `I could not find a strong Simba match for "${query}" yet. Try a more specific product or meal idea.`,
    products: matches,
    productIds: matches.map((product) => product.id),
    source: 'local',
  };
}

export function buildShopSearchUrl(query: string, products: Product[] = []): string {
  const params = new URLSearchParams();
  params.set('q', query.trim());
  const ids = products
    .map((product) => product.id)
    .filter((id) => Number.isFinite(id));
  if (ids.length > 0) {
    params.set('ids', ids.join(','));
  }
  return `/shop?${params.toString()}`;
}

export async function runConversationalSearch(
  query: string,
  products: Product[],
  limit: number = DEFAULT_LIMIT
): Promise<ConversationalSearchResult> {
  const localResult = buildLocalConversationalResult(query, products, limit);
  const productMap = new Map(products.map((product) => [product.id, product]));

  try {
    const response = await fetch('/api/catalog-assistant/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
      }),
    });

    if (!response.ok) {
      throw new Error(`Catalog assistant request failed (${response.status})`);
    }

    const data = await response.json();
    const rawProductIds = Array.isArray(data?.product_ids) ? data.product_ids : [];
    const matchedProducts = rawProductIds.length > 0
      ? rawProductIds
          .map((id: unknown) => {
            const numericId = typeof id === 'number' ? id : Number(id);
            return Number.isFinite(numericId) ? productMap.get(numericId) || null : null;
          })
          .filter((product: Product | null): product is Product => Boolean(product))
          .filter((product: Product) => isProductRelevantToQuery(query, product))
      : [];
    const acceptedEveryAiProduct = matchedProducts.length === rawProductIds.length;
    const message = acceptedEveryAiProduct && typeof data?.message === 'string' && data.message.trim()
      ? data.message.trim()
      : matchedProducts.length > 0
        ? `I found ${matchedProducts.length} Simba products related to "${query}".`
        : localResult.message;

    return {
      message,
      products: matchedProducts.length > 0 ? matchedProducts : localResult.products,
      productIds: matchedProducts.length > 0
        ? matchedProducts.map((product) => product.id)
        : localResult.productIds,
      source: data?.source === 'groq' ? 'groq' : 'local',
    };
  } catch {
    return localResult;
  }
}
