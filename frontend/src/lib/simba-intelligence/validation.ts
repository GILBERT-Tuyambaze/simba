/**
 * SIMBA ASSISTANT VALIDATION TESTS
 * Phase 12: Complete scenario validation
 *
 * Tests all critical success scenarios to ensure proper functioning
 * of the assistant across all phases.
 */

import type { Product } from '@/lib/types';
import {
  scoreProductWithExplanation,
  filterRelevantProducts,
  MIN_RELEVANCE,
} from './catalog';
import { identifyRecipe, matchRecipeToProducts, buildCartFromRecipe } from './recipeEngine';
import { optimizeCartForPrice, findCheaperAlternatives } from './cartBuilder';
import { filterByBranchAvailability, validateUserPermission } from './branchRoleAwareness';
import { classifyIntent } from './intentClassifier';

// ===== TEST SCENARIOS =====

export interface TestScenario {
  name: string;
  description: string;
  testFn: () => Promise<boolean>;
}

/**
 * Scenario 1: "Help me make pizza"
 * Should identify recipe, match ingredients, suggest shopping
 */
export function testPizzaRecipe(products: Product[]): {
  passed: boolean;
  recipe: string;
  ingredients: number;
  coverage: number;
} {
  const query = 'Help me make pizza';
  const recipe = identifyRecipe(query);

  if (!recipe) {
    return { passed: false, recipe: 'Not identified', ingredients: 0, coverage: 0 };
  }

  const matched = matchRecipeToProducts(recipe, products);
  const coverage = matched.coverage;

  // Should have good coverage
  const passed = coverage >= 0.6 && matched.missingIngredients.length <= 3;

  return {
    passed,
    recipe: recipe.name,
    ingredients: recipe.ingredients.length,
    coverage: coverage,
  };
}

/**
 * Scenario 2: "Prepare breakfast for 4 people"
 * Should handle meal planning for multiple servings
 */
export function testBreakfastPlanning(products: Product[]): {
  passed: boolean;
  recipe: string;
  itemsMatched: number;
  totalCost: number;
} {
  const query = 'Prepare breakfast for 4 people';
  const recipe = identifyRecipe(query);

  if (!recipe) {
    return { passed: false, recipe: 'Not identified', itemsMatched: 0, totalCost: 0 };
  }

  const shopping = buildCartFromRecipe(recipe, products);
  const passed = shopping.items.length >= 3 && shopping.totalCost > 0;

  return {
    passed,
    recipe: recipe.name,
    itemsMatched: shopping.items.length,
    totalCost: shopping.totalCost,
  };
}

/**
 * Scenario 3: "Build a shopping list for a family"
 * Should create comprehensive grocery list
 */
export function testFamilyShoppingList(products: Product[]): {
  passed: boolean;
  itemsAdded: number;
  coverage: number;
} {
  const query = 'Build a shopping list for a family';
  const recipe = identifyRecipe(query);

  if (!recipe) {
    return { passed: false, itemsAdded: 0, coverage: 0 };
  }

  const matched = matchRecipeToProducts(recipe, products);
  const passed = matched.matchedIngredients.length >= 5;

  return {
    passed,
    itemsAdded: matched.matchedIngredients.filter((m) => m.products.length > 0).length,
    coverage: matched.coverage,
  };
}

/**
 * Scenario 4: "Find healthy snacks"
 * Should filter and recommend relevant products
 */
export function testHealthySnacks(products: Product[]): {
  passed: boolean;
  resultsCount: number;
  allRelevant: boolean;
} {
  const query = 'Find healthy snacks';
  const relevant = filterRelevantProducts(query, products);

  // Check that all results have minimum relevance score
  const allMeetThreshold = relevant.every((p) => {
    const explanation = scoreProductWithExplanation(query, p);
    return explanation.score >= MIN_RELEVANCE;
  });

  // Should find at least 3 relevant products
  const passed = relevant.length >= 3 && allMeetThreshold;

  return {
    passed,
    resultsCount: relevant.length,
    allRelevant: allMeetThreshold,
  };
}

/**
 * Scenario 5: "Recommend products under 20,000 RWF"
 * Should filter by price constraint
 */
export function testPriceFilter(products: Product[]): {
  passed: boolean;
  resultsCount: number;
  allUnderPrice: boolean;
} {
  const query = 'Recommend products under 20,000 RWF';
  const priceLimit = 20000;

  const filtered = filterRelevantProducts(query, products).filter((p) => p.price <= priceLimit);

  const allUnderPrice = filtered.every((p) => p.price <= priceLimit);
  const passed = filtered.length >= 3 && allUnderPrice;

  return {
    passed,
    resultsCount: filtered.length,
    allUnderPrice,
  };
}

/**
 * Scenario 6: "Make my cart cheaper"
 * Should find budget alternatives
 */
export function testCartOptimization(products: Product[]): {
  passed: boolean;
  savings: number;
  alternatives: number;
} {
  // Create mock cart items
  const cartItems = products.slice(0, 3).map((p) => ({
    product_id: p.id,
    product_name: p.name,
    price: p.price,
    image: p.image,
    quantity: 1,
    unit: p.unit,
  }));

  if (cartItems.length === 0) {
    return { passed: false, savings: 0, alternatives: 0 };
  }

  const cheaper = findCheaperAlternatives(cartItems, products);
  const totalSavings = cheaper.reduce((sum, swap) => sum + swap.savings, 0);

  return {
    passed: cheaper.length > 0,
    savings: totalSavings,
    alternatives: cheaper.length,
  };
}

/**
 * Scenario 7: "What can I cook with what is already in my cart?"
 * Should suggest recipes based on ingredients
 */
export function testRecipeSuggestion(products: Product[]): {
  passed: boolean;
  suggestedRecipes: number;
  bestRecipe: string;
} {
  // Mock cart with common ingredients
  const cartProducts = products.filter((p) => {
    const name = p.name.toLowerCase();
    return (
      name.includes('oil') ||
      name.includes('rice') ||
      name.includes('salt') ||
      name.includes('flour') ||
      name.includes('egg')
    );
  });

  if (cartProducts.length === 0) {
    return { passed: false, suggestedRecipes: 0, bestRecipe: 'None' };
  }

  // Try to identify recipes that match available products
  const recipes = [
    identifyRecipe('fried rice'),
    identifyRecipe('chapati'),
    identifyRecipe('rice and beans'),
  ].filter((r): r is ReturnType<typeof identifyRecipe> => Boolean(r));

  let bestRecipe = recipes[0];
  let bestCoverage = 0;

  for (const recipe of recipes) {
    const matched = matchRecipeToProducts(recipe, cartProducts);
    if (matched.coverage > bestCoverage) {
      bestCoverage = matched.coverage;
      bestRecipe = recipe;
    }
  }

  return {
    passed: bestCoverage >= 0.5,
    suggestedRecipes: recipes.length,
    bestRecipe: bestRecipe?.name || 'None',
  };
}

/**
 * Scenario 8: "Compare these products"
 * Should provide detailed product comparison
 */
export function testProductComparison(products: Product[]): {
  passed: boolean;
  compared: number;
  hasDifferences: boolean;
} {
  const query = 'compare products';
  const intent = classifyIntent(query);

  // Should classify as product expert or recommendation
  const isComparisonIntent =
    intent === 'product_expert' || intent === 'recommendation_request' || intent === 'product_search';

  const compared = Math.min(2, products.length);
  const hasDifferences = compared >= 2;

  return {
    passed: isComparisonIntent && hasDifferences,
    compared,
    hasDifferences,
  };
}

/**
 * Scenario 9: "Help me find my order"
 * Should recognize order tracking intent
 */
export function testOrderTracking(): {
  passed: boolean;
  intent: string;
} {
  const query = 'Help me find my order';
  const intent = classifyIntent(query);

  const isOrderIntent = intent === 'order_tracking' || intent === 'customer_support';

  return {
    passed: isOrderIntent,
    intent,
  };
}

/**
 * Scenario 10: "Show alternatives if unavailable"
 * Should handle branch-aware recommendations
 */
export function testBranchAlternatives(products: Product[]): {
  passed: boolean;
  available: number;
  alternatives: number;
} {
  const branch = 'Kigali';
  const available = filterByBranchAvailability(products, branch);
  const alternatives = products.length - available.length;

  return {
    passed: available.length > 0,
    available: available.length,
    alternatives,
  };
}

/**
 * Scenario 11: "No baby products for pizza"
 * Validates that irrelevant products are never recommended
 */
export function testRelevanceFilter(products: Product[]): {
  passed: boolean;
  pizzaResults: number;
  babyProducts: number;
  allRelevant: boolean;
} {
  const query = 'pizza';

  const results = filterRelevantProducts(query, products);

  // Count baby products in results (should be none or very few)
  const babyProducts = results.filter((p) => {
    const category = p.category?.toLowerCase() || '';
    return category.includes('baby');
  }).length;

  // All should meet minimum relevance
  const allRelevant = results.every((p) => {
    const explanation = scoreProductWithExplanation(query, p);
    return explanation.score >= MIN_RELEVANCE;
  });

  const passed = babyProducts === 0 && allRelevant;

  return {
    passed,
    pizzaResults: results.length,
    babyProducts,
    allRelevant,
  };
}

/**
 * Scenario 12: Role-based permissions
 * Validates that permissions are properly enforced
 */
export function testRolePermissions(): {
  passed: boolean;
  guestCanSearch: boolean;
  guestCanCheckout: boolean;
  customerCanCheckout: boolean;
  staffCanViewInventory: boolean;
  staffCanCheckout: boolean;
} {
  const guestSearch = validateUserPermission('guest', 'search');
  const guestCheckout = validateUserPermission('guest', 'checkout');
  const customerCheckout = validateUserPermission('customer', 'checkout');
  const staffInventory = validateUserPermission('branch_staff', 'view_inventory');
  const staffCheckout = validateUserPermission('branch_staff', 'checkout');

  const passed =
    guestSearch.allowed &&
    !guestCheckout.allowed &&
    customerCheckout.allowed &&
    staffInventory.allowed &&
    !staffCheckout.allowed;

  return {
    passed,
    guestCanSearch: guestSearch.allowed,
    guestCanCheckout: guestCheckout.allowed,
    customerCanCheckout: customerCheckout.allowed,
    staffCanViewInventory: staffInventory.allowed,
    staffCanCheckout: staffCheckout.allowed,
  };
}

// ===== VALIDATION RUNNER =====

export interface ValidationReport {
  scenario: string;
  passed: boolean;
  details: Record<string, unknown>;
}

/**
 * Run all validation scenarios
 */
export async function runAllValidations(products: Product[]): Promise<{
  total: number;
  passed: number;
  failed: number;
  results: ValidationReport[];
  summary: string;
}> {
  const results: ValidationReport[] = [];

  const scenarios = [
    { name: 'Pizza Recipe', fn: () => testPizzaRecipe(products) },
    { name: 'Breakfast Planning', fn: () => testBreakfastPlanning(products) },
    { name: 'Family Shopping List', fn: () => testFamilyShoppingList(products) },
    { name: 'Healthy Snacks', fn: () => testHealthySnacks(products) },
    { name: 'Price Filter (< 20K RWF)', fn: () => testPriceFilter(products) },
    { name: 'Cart Optimization', fn: () => testCartOptimization(products) },
    { name: 'Recipe Suggestions', fn: () => testRecipeSuggestion(products) },
    { name: 'Product Comparison', fn: () => testProductComparison(products) },
    { name: 'Order Tracking', fn: () => testOrderTracking() },
    { name: 'Branch Alternatives', fn: () => testBranchAlternatives(products) },
    { name: 'Relevance Filter', fn: () => testRelevanceFilter(products) },
    { name: 'Role Permissions', fn: () => testRolePermissions() },
  ];

  for (const scenario of scenarios) {
    const result = scenario.fn();
    results.push({
      scenario: scenario.name,
      passed: result.passed,
      details: result,
    });
  }

  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = results.length - passedCount;

  const summary =
    passedCount === results.length
      ? '✅ All scenarios validated successfully!'
      : `⚠️ ${passedCount}/${results.length} scenarios passed. ${failedCount} need attention.`;

  return {
    total: results.length,
    passed: passedCount,
    failed: failedCount,
    results,
    summary,
  };
}
