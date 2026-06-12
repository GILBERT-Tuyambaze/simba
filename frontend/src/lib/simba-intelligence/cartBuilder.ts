/**
 * SIMBA CART BUILDER
 * Phase 5: Cart actions and optimization
 *
 * Capabilities:
 * - ADD_TO_CART: Add products to cart
 * - REMOVE_FROM_CART: Remove products from cart
 * - REPLACE_PRODUCT: Replace expensive with cheaper alternatives
 * - CHEAPER_ALTERNATIVE: Find budget-friendly swaps
 * - HEALTHIER_ALTERNATIVE: Find better-for-you swaps
 */

import type { CartItem, Product } from '@/lib/types';
import { getProductStockForBranch } from '@/lib/product-stock';
import { scoreProduct } from './catalog';

export type CartActionType = 'ADD' | 'REMOVE' | 'REPLACE' | 'OPTIMIZE';

export interface CartAction {
  type: CartActionType;
  label: string;
  description: string;
  productIds: number[];
  replacementIds?: number[];
  budget?: number;
  savings?: number;
}

export interface CartOptimization {
  currentTotal: number;
  optimizedTotal: number;
  savings: number;
  actions: CartAction[];
  swaps: Array<{
    original: CartItem;
    replacement: Product;
    savings: number;
    healthierScore?: number;
  }>;
}

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

// ===== HEALTH SCORING =====

/**
 * Score product healthiness based on description and tags
 * Returns 0-1 score
 */
function scoreProductHealth(product: Product): number {
  const description = normalizeText(product.description);
  const tags = parseStringList(product.tags).map((t) => t.toLowerCase());
  const name = normalizeText(product.name);

  const healthyKeywords = [
    'organic', 'natural', 'low fat', 'zero sugar', 'protein', 'fiber',
    'whole grain', 'wholegrain', 'unsweetened', 'fresh', 'vegetable',
    'fruit', 'healthy', 'wellness', 'nutritious', 'premium', 'quality'
  ];

  const unhealthyKeywords = [
    'sugar', 'fat', 'fried', 'processed', 'artificial', 'synthetic',
    'chemical', 'additive', 'preservative', 'high sugar', 'high fat'
  ];

  let score = 0.5; // Base score

  // Check description and tags
  const allText = [description, tags.join(' '), name].join(' ');
  const healthyCount = healthyKeywords.filter((kw) => allText.includes(kw)).length;
  const unhealthyCount = unhealthyKeywords.filter((kw) => allText.includes(kw)).length;

  score += healthyCount * 0.1;
  score -= unhealthyCount * 0.1;

  // Consider price as quality indicator (higher price often = better quality)
  const price = Number(product.price || 0);
  if (price > 50000) {
    score += 0.1;
  }

  // Consider rating
  const rating = Number(product.rating || 0);
  if (rating >= 4.5) {
    score += 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

// ===== CART OPTIMIZATION =====

/**
 * Find cheaper alternatives for products in cart
 */
export function findCheaperAlternatives(
  cartItems: CartItem[],
  products: Product[],
  branch?: string
): Array<{ original: CartItem; replacement: Product; savings: number }> {
  const alternatives: Array<{ original: CartItem; replacement: Product; savings: number }> = [];

  for (const cartItem of cartItems) {
    // Find similar products in the same category
    const categoryMatches = products.filter(
      (p) =>
        p.id !== cartItem.product_id &&
        (p.category === cartItem.product_name || // Exact category
          p.name.toLowerCase().includes(cartItem.product_name.toLowerCase()) || // Name overlap
          cartItem.product_name.toLowerCase().includes(p.name.toLowerCase()))
    );

    // Find cheaper alternatives that are still in stock
    const cheaper = categoryMatches
      .filter((p) => {
        const stock = getProductStockForBranch(p, branch);
        return p.price < cartItem.price && stock > 0;
      })
      .sort((a, b) => a.price - b.price)[0]; // Get cheapest

    if (cheaper) {
      alternatives.push({
        original: cartItem,
        replacement: cheaper,
        savings: cartItem.price - cheaper.price,
      });
    }
  }

  return alternatives;
}

/**
 * Find healthier alternatives for products in cart
 */
export function findHealthierAlternatives(
  cartItems: CartItem[],
  products: Product[],
  branch?: string
): Array<{ original: CartItem; replacement: Product; healthierScore: number }> {
  const alternatives: Array<{ original: CartItem; replacement: Product; healthierScore: number }> = [];

  for (const cartItem of cartItems) {
    const originalProduct = products.find((p) => p.id === cartItem.product_id);
    const originalHealth = originalProduct
      ? scoreProductHealth(originalProduct)
      : 0.5;

    // Find similar products with better health score
    const categoryMatches = products.filter(
      (p) =>
        p.id !== cartItem.product_id &&
        (p.category === cartItem.product_name ||
          p.name.toLowerCase().includes(cartItem.product_name.toLowerCase()) ||
          cartItem.product_name.toLowerCase().includes(p.name.toLowerCase()))
    );

    let best: Product | undefined;
    let bestScore = originalHealth;

    for (const candidate of categoryMatches) {
      const stock = getProductStockForBranch(candidate, branch);
      if (stock > 0) {
        const candidateHealth = scoreProductHealth(candidate);
        if (candidateHealth > bestScore) {
          bestScore = candidateHealth;
          best = candidate;
        }
      }
    }

    if (best) {
      alternatives.push({
        original: cartItem,
        replacement: best,
        healthierScore: bestScore - originalHealth,
      });
    }
  }

  return alternatives;
}

/**
 * Optimize cart for price
 */
export function optimizeCartForPrice(
  cartItems: CartItem[],
  products: Product[],
  branch?: string
): CartOptimization {
  const currentTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const swaps = findCheaperAlternatives(cartItems, products, branch);
  const actions: CartAction[] = [];

  if (swaps.length > 0) {
    const totalSavings = swaps.reduce((sum, swap) => sum + swap.savings * swap.original.quantity, 0);
    const optimizedTotal = currentTotal - totalSavings;

    actions.push({
      type: 'OPTIMIZE',
      label: `Save ${totalSavings.toFixed(0)} RWF with cheaper alternatives`,
      description: `Replace ${swaps.length} item(s) with cheaper options.`,
      productIds: swaps.map((s) => s.original.product_id),
      replacementIds: swaps.map((s) => s.replacement.id),
      budget: optimizedTotal,
      savings: totalSavings,
    });

    for (const swap of swaps) {
      actions.push({
        type: 'REPLACE',
        label: `Replace ${swap.original.product_name} with ${swap.replacement.name}`,
        description: `Save ${swap.savings.toFixed(0)} RWF per unit (${(swap.savings * swap.original.quantity).toFixed(0)} RWF total).`,
        productIds: [swap.original.product_id],
        replacementIds: [swap.replacement.id],
        savings: swap.savings * swap.original.quantity,
      });
    }

    return {
      currentTotal,
      optimizedTotal,
      savings: totalSavings,
      actions,
      swaps,
    };
  }

  return {
    currentTotal,
    optimizedTotal: currentTotal,
    savings: 0,
    actions,
    swaps: [],
  };
}

/**
 * Optimize cart for health
 */
export function optimizeCartForHealth(
  cartItems: CartItem[],
  products: Product[],
  branch?: string
): CartOptimization {
  const currentTotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const swaps = findHealthierAlternatives(cartItems, products, branch);
  const actions: CartAction[] = [];

  if (swaps.length > 0) {
    const avgHealthImprovement = swaps.reduce((sum, swap) => sum + swap.healthierScore, 0) / swaps.length;

    actions.push({
      type: 'OPTIMIZE',
      label: `Upgrade to healthier alternatives`,
      description: `Replace ${swaps.length} item(s) with healthier options (avg improvement: +${(avgHealthImprovement * 100).toFixed(0)}%).`,
      productIds: swaps.map((s) => s.original.product_id),
      replacementIds: swaps.map((s) => s.replacement.id),
      budget: currentTotal,
    });

    for (const swap of swaps) {
      actions.push({
        type: 'REPLACE',
        label: `Replace with ${swap.replacement.name}`,
        description: `Healthier choice (+${(swap.healthierScore * 100).toFixed(0)}% health score).`,
        productIds: [swap.original.product_id],
        replacementIds: [swap.replacement.id],
      });
    }

    return {
      currentTotal,
      optimizedTotal: currentTotal,
      savings: 0,
      actions,
      swaps: swaps.map((s) => ({ ...s, savings: 0 })),
    };
  }

  return {
    currentTotal,
    optimizedTotal: currentTotal,
    savings: 0,
    actions,
    swaps: [],
  };
}

/**
 * Suggest missing items to complete a meal/plan
 */
export function suggestMissingItems(
  cartItems: CartItem[],
  products: Product[],
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack',
  branch?: string
): Product[] {
  const mealRequirements: Record<string, string[]> = {
    breakfast: ['milk', 'bread', 'eggs', 'coffee', 'tea', 'butter', 'jam'],
    lunch: ['rice', 'oil', 'salt', 'vegetables', 'meat', 'sauce'],
    dinner: ['rice', 'vegetables', 'protein', 'oil', 'salt', 'spices'],
    snack: ['nuts', 'fruit', 'biscuits', 'chocolate', 'juice', 'water'],
  };

  const required = mealRequirements[mealType] || [];
  const cartNames = cartItems.map((item) => item.product_name.toLowerCase());
  const missing = required.filter((item) => !cartNames.some((cn) => cn.includes(item) || item.includes(cn)));

  const suggestions: Product[] = [];
  for (const missingItem of missing) {
    const match = products
      .filter((p) => {
        const stock = getProductStockForBranch(p, branch);
        return (
          stock > 0 &&
          (p.name.toLowerCase().includes(missingItem) ||
            p.description?.toLowerCase().includes(missingItem) ||
            parseStringList(p.tags).some((t) => t.toLowerCase().includes(missingItem)))
        );
      })
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];

    if (match) {
      suggestions.push(match);
    }
  }

  return suggestions;
}

/**
 * Build cart from ingredient list
 */
export function buildCartFromIngredients(
  ingredients: string[],
  products: Product[],
  branch?: string
): {
  items: CartItem[];
  matched: string[];
  missing: string[];
} {
  const items: CartItem[] = [];
  const matched: string[] = [];
  const missing: string[] = [];

  for (const ingredient of ingredients) {
    const match = products
      .filter((p) => {
        const stock = getProductStockForBranch(p, branch);
        return (
          stock > 0 &&
          (p.name.toLowerCase().includes(ingredient.toLowerCase()) ||
            p.description?.toLowerCase().includes(ingredient.toLowerCase()) ||
            parseStringList(p.tags).some((t) => t.toLowerCase().includes(ingredient.toLowerCase())))
        );
      })
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))[0];

    if (match) {
      items.push({
        product_id: match.id,
        product_name: match.name,
        price: match.price,
        image: match.image,
        quantity: 1,
        branch,
        unit: match.unit,
      });
      matched.push(ingredient);
    } else {
      missing.push(ingredient);
    }
  }

  return { items, matched, missing };
}
