import { getProductStockForBranch } from '@/lib/product-stock';
import type { Product } from '@/lib/types';
import {
  classifyIntent,
  getSupportResponse,
  type SimbaIntent,
  isRecommendationIntent,
  isSupportIntent,
  isOrderTrackingIntent,
} from './intentClassifier';

export type RankingStrategy = 'popular' | 'price-asc' | 'price-desc' | 'rating' | 'discount';

export type ProductQueryOptions = {
  category?: string;
  brand?: string;
  query?: string;
  ids?: number[];
  priceMax?: number;
  saleOnly?: boolean;
  inStockOnly?: boolean;
  sort?: string;
  limit?: number;
  offset?: number;
};

export type SimbaSearchPlan = {
  intent: SimbaIntent;
  query: string;
  branch?: string;
  options: ProductQueryOptions;
  ranking: RankingStrategy;
  useFallbackLocalSearch: boolean;
  supportReply?: string;
  supportUrl?: string;
  explanation: string;
  suggestions: string[];
  confidence: number;
  selectedProductIds?: number[];
};

const DEFAULT_LIMIT = 48;
const DEAL_QUERY_TERMS = /\b(deal|deals|discount|discounts|promo|promos|sale|sales)\b/;

function normalizeQuery(query: string): string {
  return query.trim();
}

function buildRankingStrategy(intent: SimbaIntent, query: string): RankingStrategy {
  const normalized = query.trim().toLowerCase();
  if (intent === 'recommendation_request') {
    return DEAL_QUERY_TERMS.test(normalized) ? 'discount' : 'rating';
  }

  if (intent === 'product_search') {
    return 'popular';
  }

  return 'popular';
}

function buildSuggestions(intent: SimbaIntent): string[] {
  switch (intent) {
    case 'support_question':
      return ['Visit the support page', 'Check your account orders', 'Review branch hours and policies'];
    case 'order_tracking':
      return ['Open your account orders', 'Track delivery status', 'Request a refund or return'];
    case 'recommendation_request':
      return ['Browse best sellers', 'Look for deals and discounts', 'Search by category or brand'];
    case 'product_search':
      return ['Filter by category', 'Sort by rating', 'Try a more specific product name'];
    default:
      return ['Ask about products', 'Try a shopping question', 'Request deals or ideas'];
  }
}

function buildExplanation(intent: SimbaIntent, query: string): string {
  if (!query.trim()) {
    return 'Using your current branch and browsing preferences to surface the most relevant Simba products.';
  }

  switch (intent) {
    case 'support_question':
      return 'Detected a support question and prioritizing guidance with product suggestions only when relevant.';
    case 'order_tracking':
      return 'Detected an order tracking request and surfaced account support options alongside product results.';
    case 'recommendation_request':
      return 'Detected a recommendation request and will use best sellers or deals to suggest products.';
    case 'product_search':
      return 'Detected a product search query and will prioritize items that match your phrasing and availability.';
    default:
      return 'Using the Simba intelligence layer to match your request with the best available products and support advice.';
  }
}

function buildConfidence(intent: SimbaIntent, query: string, selectedProductIds?: number[]): number {
  if (selectedProductIds?.length) {
    return 0.95;
  }
  const terms = getBaseQueryTerms(query);
  if (!query.trim()) {
    return 0.55;
  }
  if (intent === 'general_chat') {
    return 0.7;
  }
  if (intent === 'support_question' || intent === 'order_tracking') {
    return 0.82;
  }
  if (terms.length >= 2) {
    return 0.84;
  }
  return 0.68;
}

export function buildSearchPlan(
  query: string,
  branch?: string,
  selectedProductIds?: number[]
): SimbaSearchPlan {
  const normalizedQuery = normalizeQuery(query);
  const intent = classifyIntent(normalizedQuery);
  const ranking = buildRankingStrategy(intent, normalizedQuery);
  const support = isSupportIntent(normalizedQuery) || isOrderTrackingIntent(normalizedQuery)
    ? getSupportResponse(normalizedQuery, branch)
    : undefined;
  const suggestions = buildSuggestions(intent);
  const explanation = buildExplanation(intent, normalizedQuery);
  const confidence = buildConfidence(intent, normalizedQuery, selectedProductIds);

  const options: ProductQueryOptions = {
    sort: ranking,
    limit: Math.min(DEFAULT_LIMIT, Math.max(1, selectedProductIds?.length || DEFAULT_LIMIT)),
  };

  if (selectedProductIds && selectedProductIds.length > 0) {
    options.ids = selectedProductIds;
    options.limit = selectedProductIds.length;
  } else if (intent === 'recommendation_request' || intent === 'general_chat') {
    options.query = '';
    options.limit = DEFAULT_LIMIT;
  } else {
    options.query = normalizedQuery;
    options.limit = DEFAULT_LIMIT;
    if (DEAL_QUERY_TERMS.test(normalizedQuery)) {
      options.saleOnly = true;
    }
  }

  return {
    intent,
    query: normalizedQuery,
    branch,
    options,
    ranking,
    useFallbackLocalSearch: true,
    supportReply: support?.supportReply,
    supportUrl: support?.supportUrl,
    explanation,
    suggestions,
    confidence,
    selectedProductIds,
  };
}

const DEFAULT_TEXT_SCORE = 2;

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

function getBaseQueryTerms(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g)
    ?.filter((term) => !['available', 'best', 'buy', 'can', 'for', 'from', 'get', 'have', 'i', 'im', 'in', 'item', 'items', 'looking', 'me', 'need', 'on', 'our', 'product', 'products', 'related', 'result', 'results', 'show', 'simba', 'store', 'supermarket', 'the', 'to', 'please', 'search', 'want', 'with', 'your', 'you'].includes(term)) || [];
}

function expandQueryTerms(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  const terms = getBaseQueryTerms(query);
  if (normalized.includes('breakfast')) {
    terms.push('milk', 'bread', 'eggs', 'tea', 'coffee', 'cereal', 'oats');
  }
  if (normalized.includes('dairy')) {
    terms.push('milk', 'yogurt', 'cheese');
  }
  if (normalized.includes('coffee')) {
    terms.push('coffee', 'milk', 'sugar', 'biscuits');
  }
  if (normalized.includes('tea')) {
    terms.push('tea', 'milk', 'sugar', 'biscuits');
  }
  if (normalized.includes('snack')) {
    terms.push('biscuits', 'crisps', 'juice', 'soda', 'chocolate');
  }
  if (normalized.includes('deal') || normalized.includes('sale') || normalized.includes('discount')) {
    terms.push('discount', 'sale', 'promo');
  }
  return Array.from(new Set(terms));
}

function isDealIntent(query: string): boolean {
  return DEAL_QUERY_TERMS.test(query.trim().toLowerCase());
}

function hasSpecificProductIntent(query: string): boolean {
  return getBaseQueryTerms(query).length > 1;
}

export function isProductRelevantToQuery(query: string, product: Product, branch?: string): boolean {
  return scoreProduct(query, product, branch) > 0;
}

function scoreProduct(query: string, product: Product, branch?: string): number {
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

  if (textScore < DEFAULT_TEXT_SCORE) {
    const isGenericDealQuery = isDealIntent(query) && !hasSpecificProductIntent(query);
    if (!isGenericDealQuery || !((product.discount || 0) > 0 || product.on_sale)) {
      return 0;
    }
  }

  const branchStock = branch ? getProductStockForBranch(product, branch) : getProductStockForBranch(product);
  if (branch && product.branch_stock && branchStock <= 0) {
    return 0;
  }

  const qualityScore =
    (product.in_stock && !product.out_of_stock ? 2 : 0)
    + ((product.rating || 0) >= 4.5 ? 1 : 0)
    + ((product.discount || 0) > 0 ? 1 : 0)
    + (product.best_seller ? 1 : 0)
    + (branch && branchStock > 0 ? 2 : 0);

  return textScore + qualityScore;
}

export function buildLocalConversationalMatches(
  query: string,
  products: Product[],
  limit: number = 8,
  branch?: string
): Product[] {
  return [...products]
    .map((product) => ({ product, score: scoreProduct(query, product, branch) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score
        || Number(Boolean(getProductStockForBranch(b.product, branch))) - Number(Boolean(getProductStockForBranch(a.product, branch)))
        || (b.product.rating || 0) - (a.product.rating || 0)
        || (b.product.discount || 0) - (a.product.discount || 0)
    )
    .slice(0, limit)
    .map((entry) => entry.product);
}

export function buildLocalConversationalResult(
  query: string,
  products: Product[],
  limit: number = 8,
  branch?: string
): {
  products: Product[];
  productIds: number[];
  supportReply?: string;
  supportUrl?: string;
  branchMessage: string;
} {
  const matches = buildLocalConversationalMatches(query, products, limit, branch);
  const support = isSupportIntent(query) ? getSupportResponse(query, branch) : undefined;
  const branchMessage = branch ? ` available at ${branch}` : '';

  return {
    products: matches,
    productIds: matches.map((product) => product.id),
    supportReply: support?.supportReply,
    supportUrl: support?.supportUrl,
    branchMessage,
  };
}
