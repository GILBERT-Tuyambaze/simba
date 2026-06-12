/**
 * SIMBA CATALOG INTELLIGENCE
 * Phase 1: Catalog indexing, semantic text generation, and relevance scoring
 *
 * Requirements:
 * - Generate semantic text for every product using: name, description, category, brand, tags, keywords, inventory
 * - Implement relevance scoring with explicit weight factors
 * - Enforce minimum threshold of 0.65
 * - Provide "why recommended" explanations
 * - Never recommend products using name-only matching
 */

import type { Product } from '@/lib/types';
import { getProductStockForBranch } from '@/lib/product-stock';

/**
 * Score breakdown explaining why a product was recommended
 */
export interface RelevanceExplanation {
  score: number;
  passed: boolean; // true if score >= MIN_THRESHOLD
  factors: {
    intentMatch: { score: number; weight: number; reason: string };
    descriptionMatch: { score: number; weight: number; reason: string };
    categoryMatch: { score: number; weight: number; reason: string };
    tagsMatch: { score: number; weight: number; reason: string };
    availability: { score: number; weight: number; reason: string };
    popularity: { score: number; weight: number; reason: string };
  };
  summary: string; // Human-readable explanation
}

/**
 * Indexed catalog entry with semantic text
 */
export interface CatalogEntry {
  id: number;
  product: Product;
  semanticText: string;
  keywords: string[];
  indexed: boolean;
}

/**
 * Scored product with explanation
 */
export interface ScoredProduct {
  product: Product;
  relevance: RelevanceExplanation;
  whyRecommended: string;
}

export const MIN_RELEVANCE = 0.65;

// ===== UTILITY FUNCTIONS =====

function normalizeText(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function parseStringList(value: unknown): string[] {
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
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function categoryKeywords(category?: string | null): string[] {
  const normalized = normalizeText(category);
  const base = tokenize(normalized);

  if (!normalized) {
    return [];
  }

  const extra: Record<string, string[]> = {
    'food products': ['grocery', 'groceries', 'food', 'meal', 'snack', 'ingredient', 'kitchen', 'dinner', 'cooking', 'culinary'],
    'baby products': ['baby', 'infant', 'toddler', 'child', 'feeding', 'baby care'],
    'household products': ['household', 'cleaning', 'laundry', 'soap', 'detergent', 'home', 'maintenance'],
    'beauty and health': ['beauty', 'health', 'personal care', 'skincare', 'hygiene', 'wellness'],
    beverages: ['drink', 'juice', 'soda', 'water', 'tea', 'coffee', 'beverage', 'beverage'],
    bakery: ['bread', 'bake', 'pastry', 'baking', 'grain'],
    dairy: ['milk', 'cheese', 'yogurt', 'butter', 'dairy', 'cream'],
    fruits: ['fruit', 'fresh', 'produce', 'apple', 'orange', 'banana'],
    vegetables: ['vegetable', 'veggie', 'produce', 'fresh', 'carrot', 'onion'],
    meat: ['meat', 'chicken', 'beef', 'pork', 'fish', 'protein'],
    electronics: ['electronic', 'gadget', 'tech', 'device'],
    clothing: ['cloth', 'apparel', 'wear', 'fashion'],
  };

  for (const [key, keywords] of Object.entries(extra)) {
    if (normalized.includes(key)) {
      base.push(...keywords);
    }
  }

  return unique(base);
}

function scoreOverlap(sourceTerms: string[], targetTerms: string[]): number {
  if (sourceTerms.length === 0 || targetTerms.length === 0) {
    return 0;
  }

  const target = new Set(targetTerms);
  const matched = sourceTerms.filter((term) => {
    if (target.has(term)) {
      return true;
    }
    // Allow prefix matching
    return targetTerms.some((candidate) => candidate.startsWith(term) || term.startsWith(candidate));
  }).length;

  return matched / sourceTerms.length;
}

// ===== SEMANTIC TEXT GENERATION =====

/**
 * Generate searchable semantic text for a product
 * Combines: name, description, category, brand, tags, keywords, inventory, price, discount, rating
 */
export function generateProductSemanticText(product: Product, branch?: string): string {
  const branchStock = getProductStockForBranch(product, branch);
  const availability = branchStock > 0 ? 'in stock available' : product.in_stock ? 'in stock' : 'out of stock';

  return [
    product.name,
    product.description,
    product.category,
    product.brand,
    parseStringList(product.tags).join(' '),
    parseStringList(product.keywords || []).join(' '),
    parseStringList(product.options).join(' '),
    parseStringList(product.addons).join(' '),
    parseStringList(product.modifiers).join(' '),
    `price ${Number(product.price || 0)}`,
    `discount ${Number(product.discount || 0)} percent`,
    `rating ${Number(product.rating || 0)}`,
    `stock ${branchStock}`,
    availability,
    product.best_seller ? 'best seller popular' : '',
    product.featured ? 'featured recommended' : '',
    product.new_arrival ? 'new arrival fresh' : '',
    product.on_sale || Number(product.discount || 0) > 0 ? 'sale discount promo deal' : '',
    product.backorder ? 'backorder' : '',
    product.pre_order ? 'preorder' : '',
    categoryKeywords(product.category).join(' '),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Extract keywords from semantic text for faster matching
 */
export function extractProductKeywords(product: Product): string[] {
  const semanticText = generateProductSemanticText(product);
  const keywords = unique(tokenize(semanticText));
  const filtered = keywords.filter((term) => term.length >= 2);
  return filtered;
}

/**
 * Build indexed catalog
 */
export function buildIndexedCatalog(products: Product[], branch?: string): CatalogEntry[] {
  return products.map((product) => ({
    id: product.id,
    product,
    semanticText: generateProductSemanticText(product, branch),
    keywords: extractProductKeywords(product),
    indexed: true,
  }));
}

// ===== RELEVANCE SCORING WITH WEIGHTS =====

/**
 * Get search terms from query, filtering common words
 */
function getSearchTerms(query: string): string[] {
  const common = ['and', 'the', 'for', 'with', 'what', 'need', 'want', 'help', 'me', 'a', 'an', 'to', 'my', 'your', 'is', 'are', 'show', 'find'];
  return tokenize(query).filter((term) => !common.includes(term) && term.length >= 2);
}

/**
 * Score breakdown calculation with explicit weights
 *
 * Weights (as per specification):
 * - Intent Match: 40%
 * - Description Match: 25%
 * - Category Match: 15%
 * - Tags Match: 10%
 * - Availability Match: 5%
 * - Popularity Match: 5%
 */
export function scoreProductWithExplanation(
  query: string,
  product: Product,
  branch?: string,
  intentTerms?: string[]
): RelevanceExplanation {
  const searchTerms = getSearchTerms(query);
  const semanticText = generateProductSemanticText(product, branch);
  const semanticTokens = tokenize(semanticText);
  const descriptionTerms = tokenize(product.description || '');
  const categoryTerms = categoryKeywords(product.category);
  const tags = parseStringList(product.tags);
  const branchStock = getProductStockForBranch(product, branch);

  // Availability
  const availability = branchStock > 0 ? 1 : product.in_stock ? 0.9 : 0;

  // Popularity calculation
  const ratingScore = Math.max(0, Math.min(1, (Number(product.rating || 0) / 5) * 0.6));
  const bestseller = product.best_seller ? 0.15 : 0;
  const onSale = Number(product.discount || 0) > 0 ? 0.15 : 0;
  const featured = product.featured ? 0.1 : 0;
  const popularity = ratingScore + bestseller + onSale + featured;

  // Scoring for each factor
  const finalIntentTerms = searchTerms.length > 0 ? searchTerms : intentTerms || [];
  const intentMatch = scoreOverlap(finalIntentTerms, semanticTokens);
  const descriptionMatch = scoreOverlap(searchTerms, descriptionTerms);
  const categoryMatch = scoreOverlap(searchTerms, categoryTerms);
  const tagsMatch = scoreOverlap(searchTerms, tags);

  // Weight calculation (40%, 25%, 15%, 10%, 5%, 5%)
  const weightedScore =
    intentMatch * 0.4 +
    descriptionMatch * 0.25 +
    categoryMatch * 0.15 +
    tagsMatch * 0.1 +
    availability * 0.05 +
    Math.min(popularity, 1) * 0.05;

  // Exact match boost
  const normalizedQuery = normalizeText(query);
  if (normalizedQuery && semanticText.includes(normalizedQuery)) {
    // This is a strong signal but don't exceed 0.85 for strict relevance
  }

  const finalScore = Math.min(1, weightedScore);
  const passed = finalScore >= MIN_RELEVANCE;

  // Build explanation
  const reasons: string[] = [];

  if (intentMatch > 0.5) {
    reasons.push('strong intent match');
  }
  if (descriptionMatch > 0.5) {
    reasons.push('matches product description');
  }
  if (categoryMatch > 0.5) {
    reasons.push('relevant category');
  }
  if (tagsMatch > 0.5) {
    reasons.push('matches product tags');
  }
  if (availability > 0.9) {
    reasons.push('available at branch');
  }
  if (popularity > 0.5) {
    reasons.push('highly rated or popular');
  }

  let summary = '';
  if (passed) {
    if (reasons.length > 0) {
      summary = `Recommended because it ${reasons.join(', ')}.`;
    } else {
      summary = 'Recommended based on product match and availability.';
    }
  } else {
    summary = 'Not recommended: insufficient relevance match to your query.';
  }

  return {
    score: finalScore,
    passed,
    factors: {
      intentMatch: {
        score: intentMatch,
        weight: 0.4,
        reason: `Semantic text overlap with query: ${(intentMatch * 100).toFixed(1)}%`,
      },
      descriptionMatch: {
        score: descriptionMatch,
        weight: 0.25,
        reason: `Description overlap: ${(descriptionMatch * 100).toFixed(1)}%`,
      },
      categoryMatch: {
        score: categoryMatch,
        weight: 0.15,
        reason: `Category relevance: ${(categoryMatch * 100).toFixed(1)}%`,
      },
      tagsMatch: {
        score: tagsMatch,
        weight: 0.1,
        reason: `Tags match: ${(tagsMatch * 100).toFixed(1)}%`,
      },
      availability: {
        score: availability,
        weight: 0.05,
        reason: branchStock > 0 ? `In stock at branch (${branchStock} units)` : product.in_stock ? 'In stock generally' : 'Out of stock',
      },
      popularity: {
        score: Math.min(popularity, 1),
        weight: 0.05,
        reason: `Rating: ${product.rating || 0}/5 ${product.best_seller ? '★ Best Seller' : ''} ${product.featured ? '★ Featured' : ''}`,
      },
    },
    summary,
  };
}

/**
 * Score product for recommendation
 * Returns only if score >= MIN_RELEVANCE
 */
export function scoreProduct(query: string, product: Product, branch?: string, intentTerms?: string[]): number {
  const explanation = scoreProductWithExplanation(query, product, branch, intentTerms);
  return explanation.passed ? explanation.score : 0;
}

// ===== PUBLIC API =====

/**
 * Get scored products with explanations
 * Only returns products with relevance >= MIN_RELEVANCE
 */
export function scoredProductsWithExplanation(
  query: string,
  products: Product[],
  branch?: string,
  limit: number = 8,
  intentTerms?: string[]
): ScoredProduct[] {
  return products
    .map((product) => {
      const relevance = scoreProductWithExplanation(query, product, branch, intentTerms);
      return {
        product,
        relevance,
        whyRecommended: relevance.summary,
      };
    })
    .filter((item) => item.relevance.passed)
    .sort((a, b) => b.relevance.score - a.relevance.score)
    .slice(0, limit);
}

/**
 * Get all recommendations with minimum threshold enforcement
 */
export function getRecommendations(
  query: string,
  products: Product[],
  branch?: string,
  limit: number = 8,
  intentTerms?: string[]
): {
  products: Product[];
  explanations: Map<number, RelevanceExplanation>;
  withExplanations: ScoredProduct[];
} {
  const scored = scoredProductsWithExplanation(query, products, branch, limit, intentTerms);
  const explanations = new Map(scored.map((item) => [item.product.id, item.relevance]));

  return {
    products: scored.map((item) => item.product),
    explanations,
    withExplanations: scored,
  };
}

/**
 * Verify product relevance for query
 */
export function isRelevantToQuery(query: string, product: Product, branch?: string): boolean {
  return scoreProduct(query, product, branch) >= MIN_RELEVANCE;
}

/**
 * Get explanation for why a product was/wasn't recommended
 */
export function explainRecommendation(query: string, product: Product, branch?: string): RelevanceExplanation {
  return scoreProductWithExplanation(query, product, branch);
}

/**
 * Filter products to only relevant ones
 */
export function filterRelevantProducts(query: string, products: Product[], branch?: string): Product[] {
  return products.filter((product) => isRelevantToQuery(query, product, branch));
}
