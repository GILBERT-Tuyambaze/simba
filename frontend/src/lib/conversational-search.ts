import { getAPIBaseURL } from './config';
import type { Product } from './types';

export type ConversationalSearchResult = {
  message: string;
  products: Product[];
  source: 'groq' | 'local';
};

const DEFAULT_LIMIT = 8;
const INTENT_HINTS: Record<string, string[]> = {
  breakfast: ['milk', 'bread', 'eggs', 'tea', 'coffee', 'cereal', 'oats', 'juice', 'jam', 'butter'],
  'fresh milk': ['milk', 'dairy', 'yogurt'],
  tea: ['tea', 'milk', 'sugar', 'biscuits'],
  coffee: ['coffee', 'milk', 'sugar', 'biscuits'],
  snack: ['biscuits', 'crisps', 'juice', 'soda', 'chocolate'],
};
const STOP_WORDS = new Set([
  'a',
  'an',
  'any',
  'do',
  'for',
  'have',
  'i',
  "i'm",
  'im',
  'me',
  'need',
  'show',
  'something',
  'the',
  'want',
  'with',
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
  const baseTerms = normalized
    .split(/\s+/)
    .filter((term) => Boolean(term) && term.length > 2 && !STOP_WORDS.has(term));
  const expanded = [...baseTerms];

  Object.entries(INTENT_HINTS).forEach(([phrase, hints]) => {
    if (normalized.includes(phrase)) {
      expanded.push(...hints);
    }
  });

  return Array.from(new Set(expanded));
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

export function buildLocalConversationalMatches(
  query: string,
  products: Product[],
  limit: number = DEFAULT_LIMIT
): Product[] {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = expandQueryTerms(query);

  return [...products]
    .map((product) => {
      const haystack = buildProductHaystack(product);
      const tokens = tokenize(haystack);
      const score = terms.reduce((sum, term) => sum + (tokens.has(term) ? 2 : 0), 0)
        + (normalizedQuery && haystack.includes(normalizedQuery) ? 7 : 0)
        + (product.in_stock && !product.out_of_stock ? 2 : 0)
        + ((product.rating || 0) >= 4.5 ? 1 : 0)
        + ((product.discount || 0) > 0 ? 1 : 0)
        + (product.best_seller ? 1 : 0);

      return { product, score };
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
    source: 'local',
  };
}

export async function runConversationalSearch(
  query: string,
  products: Product[],
  limit: number = DEFAULT_LIMIT
): Promise<ConversationalSearchResult> {
  const localResult = buildLocalConversationalResult(query, products, limit);
  const productMap = new Map(products.map((product) => [product.id, product]));

  try {
    const response = await fetch(`${getAPIBaseURL()}/api/v1/catalog-assistant/search`, {
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
    const matchedProducts = Array.isArray(data?.product_ids)
      ? data.product_ids
          .map((id: unknown) => {
            const numericId = typeof id === 'number' ? id : Number(id);
            return Number.isFinite(numericId) ? productMap.get(numericId) || null : null;
          })
          .filter((product: Product | null): product is Product => Boolean(product))
      : [];

    return {
      message: typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : localResult.message,
      products: matchedProducts.length > 0 ? matchedProducts : localResult.products,
      source: data?.source === 'groq' ? 'groq' : 'local',
    };
  } catch {
    return localResult;
  }
}
