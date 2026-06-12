import { getProductStockForBranch } from '@/lib/product-stock';
import type { CartItem, Product } from '@/lib/types';
import {
  classifyIntent,
  getSupportResponse,
  isOrderTrackingIntent,
  isSupportIntent,
  type AssistantPageType,
  type SimbaIntent,
  type SimbaIntentContext,
} from './intentClassifier';
import type { SimbaConversationMessage } from './contextManager';

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

export type AssistantActionType =
  | 'ADD_TO_CART'
  | 'REMOVE_FROM_CART'
  | 'REPLACE_CART_ITEMS'
  | 'OPEN_PRODUCT'
  | 'OPEN_CHECKOUT'
  | 'OPEN_SUPPORT'
  | 'SET_BRANCH'
  | 'APPLY_SEARCH'
  | 'VIEW_ORDER';

export type AssistantAction = {
  type: AssistantActionType;
  label: string;
  description?: string;
  query?: string;
  route?: string;
  branch?: string;
  productIds?: number[];
  replacementProductIds?: number[];
};

export type RecipePlan = {
  title: string;
  query: string;
  servings: number;
  ingredients: string[];
  matchedIngredients: Array<{
    ingredient: string;
    productIds: number[];
    primaryProductId?: number | null;
    primaryProductName?: string | null;
  }>;
  missingIngredients: string[];
  instructions: string[];
  addAllProductIds: number[];
  budgetHint?: number | null;
};

export type ShoppingPlan = {
  title: string;
  query: string;
  peopleCount?: number | null;
  items: string[];
  matchedItems: Array<{
    item: string;
    productIds: number[];
    primaryProductId?: number | null;
    primaryProductName?: string | null;
  }>;
  missingItems: string[];
  addAllProductIds: number[];
  budgetHint?: number | null;
};

export type SimbaAssistantContext = SimbaIntentContext & {
  history?: SimbaConversationMessage[];
  cartItems?: CartItem[];
};

export type SimbaSearchPlan = {
  intent: SimbaIntent;
  mode: SimbaIntent;
  query: string;
  branch?: string;
  pageType?: AssistantPageType;
  pageTitle?: string;
  options: ProductQueryOptions;
  ranking: RankingStrategy;
  useFallbackLocalSearch: boolean;
  supportReply?: string;
  supportUrl?: string;
  explanation: string;
  suggestions: string[];
  confidence: number;
  selectedProductIds?: number[];
  actions: AssistantAction[];
  recipe?: RecipePlan;
  shoppingPlan?: ShoppingPlan;
  pageHint?: string;
};

const DEFAULT_LIMIT = 48;
const MIN_RELEVANCE = 0.65;
const DEAL_QUERY_TERMS = /\b(deal|deals|discount|discounts|promo|promos|sale|sales)\b/;
const CHEAP_QUERY_TERMS = /\b(cheaper|cheapest|budget|under\s+\d|save money|optimize)\b/;
const PRICE_QUERY_TERMS = /\bunder\s+([0-9][0-9,]*)\b/i;

const RECIPE_LIBRARY: Record<string, RecipePlan> = {
  pizza: {
    title: 'Pizza night',
    query: 'pizza',
    servings: 4,
    ingredients: ['flour', 'yeast', 'mozzarella', 'tomato sauce', 'salt', 'olive oil'],
    matchedIngredients: [],
    missingIngredients: [],
    instructions: [
      'Mix the dough with flour, yeast, salt, and water.',
      'Let the dough rest, then top with tomato sauce and mozzarella.',
      'Bake until the crust is golden and the cheese melts.',
    ],
    addAllProductIds: [],
  },
  chapati: {
    title: 'Chapati',
    query: 'chapati',
    servings: 4,
    ingredients: ['flour', 'salt', 'oil', 'water'],
    matchedIngredients: [],
    missingIngredients: [],
    instructions: [
      'Mix flour, salt, oil, and water to form soft dough.',
      'Rest the dough, roll thin circles, then cook on a hot pan.',
    ],
    addAllProductIds: [],
  },
  'fried rice': {
    title: 'Fried rice',
    query: 'fried rice',
    servings: 4,
    ingredients: ['rice', 'eggs', 'carrot', 'onion', 'peas', 'soy sauce', 'oil'],
    matchedIngredients: [],
    missingIngredients: [],
    instructions: [
      'Cook the rice and let it cool.',
      'Stir-fry vegetables, eggs, and rice with seasoning.',
      'Finish with soy sauce and a little oil.',
    ],
    addAllProductIds: [],
  },
  breakfast: {
    title: 'Family breakfast',
    query: 'breakfast',
    servings: 4,
    ingredients: ['milk', 'bread', 'eggs', 'tea', 'coffee', 'butter', 'cereal', 'oats'],
    matchedIngredients: [],
    missingIngredients: [],
    instructions: [
      'Pick a drink, a grain, and a protein.',
      'Add fruit or snacks for balance.',
      'Keep a backup dairy option if one item is out of stock.',
    ],
    addAllProductIds: [],
  },
  'birthday party': {
    title: 'Birthday party shopping',
    query: 'birthday party',
    servings: 8,
    ingredients: ['juice', 'cake mix', 'snacks', 'biscuits', 'soft drinks', 'water', 'plates', 'napkins'],
    matchedIngredients: [],
    missingIngredients: [],
    instructions: [
      'Start with drinks and snacks.',
      'Add serving items and a cake base if needed.',
      'Use budget alternatives for the expensive snacks.',
    ],
    addAllProductIds: [],
  },
  'healthy snacks': {
    title: 'Healthy snacks',
    query: 'healthy snacks',
    servings: 2,
    ingredients: ['nuts', 'fruit', 'yogurt', 'oats', 'wholegrain biscuits', 'water'],
    matchedIngredients: [],
    missingIngredients: [],
    instructions: [
      'Choose one fruit, one protein-rich snack, and one drink.',
      'Prefer low-sugar and high-fiber options.',
    ],
    addAllProductIds: [],
  },
  groceries: {
    title: 'Weekly groceries',
    query: 'weekly groceries',
    servings: 5,
    ingredients: ['rice', 'flour', 'oil', 'sugar', 'salt', 'milk', 'bread', 'eggs', 'soap', 'water'],
    matchedIngredients: [],
    missingIngredients: [],
    instructions: [
      'Cover staples first, then add household essentials.',
      'Prioritize items available at the selected branch.',
    ],
    addAllProductIds: [],
  },
};

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

function parseNumberList(value: unknown): number[] {
  return parseStringList(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function categoryKeywords(category?: string | null): string[] {
  const normalized = normalizeText(category);
  const base = tokenize(normalized);

  if (!normalized) {
    return [];
  }

  const extra: Record<string, string[]> = {
    'food products': ['grocery', 'groceries', 'food', 'meal', 'snack', 'ingredient', 'kitchen', 'dinner'],
    'baby products': ['baby', 'infant', 'toddler', 'child', 'feeding'],
    'household products': ['household', 'cleaning', 'laundry', 'soap', 'detergent', 'home'],
    'beauty and health': ['beauty', 'health', 'personal care', 'skincare', 'hygiene'],
    beverages: ['drink', 'juice', 'soda', 'water', 'tea', 'coffee'],
    bakery: ['bread', 'bake', 'bread', 'pastry'],
    dairy: ['milk', 'cheese', 'yogurt', 'butter'],
  };

  for (const [key, keywords] of Object.entries(extra)) {
    if (normalized.includes(key)) {
      base.push(...keywords);
    }
  }

  return unique(base);
}

function buildProductSemanticKeywords(product: Product): string[] {
  return unique([
    ...tokenize(product.name || ''),
    ...tokenize(product.category || ''),
    ...tokenize(product.brand || ''),
    ...tokenize(product.description || ''),
    ...parseStringList(product.tags),
    ...parseStringList(product.options),
    ...parseStringList(product.addons),
    ...parseStringList(product.modifiers),
    ...categoryKeywords(product.category),
    ...(product.best_seller ? ['best', 'seller', 'popular'] : []),
    ...(product.new_arrival ? ['new', 'arrival', 'fresh'] : []),
    ...(product.featured ? ['featured', 'recommended'] : []),
    ...(product.on_sale || Number(product.discount || 0) > 0 ? ['sale', 'discount', 'promo', 'deal'] : []),
    ...(product.backorder ? ['backorder'] : []),
    ...(product.pre_order ? ['pre-order'] : []),
  ]);
}

export function buildProductSemanticText(product: Product, branch?: string): string {
  const branchStock = getProductStockForBranch(product, branch);
  return [
    product.name,
    product.description,
    product.category,
    product.brand,
    parseStringList(product.tags).join(' '),
    parseStringList(product.options).join(' '),
    parseStringList(product.addons).join(' '),
    parseStringList(product.modifiers).join(' '),
    `price ${Number(product.price || 0)}`,
    `discount ${Number(product.discount || 0)} percent`,
    `rating ${Number(product.rating || 0)}`,
    `branch stock ${branchStock}`,
    product.in_stock ? 'in stock' : 'out of stock',
    product.best_seller ? 'best seller' : '',
    product.featured ? 'featured' : '',
    product.new_arrival ? 'new arrival' : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function searchTerms(query: string): string[] {
  return tokenize(query).filter((term) => !['and', 'the', 'for', 'with', 'what', 'need', 'want', 'help', 'me', 'a', 'an', 'to', 'my', 'your', 'is', 'are'].includes(term));
}

function getSpecificTerms(query: string): string[] {
  return searchTerms(query).filter((term) => term.length >= 3);
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

    return targetTerms.some((candidate) => candidate.startsWith(term) || term.startsWith(candidate));
  }).length;

  return matched / sourceTerms.length;
}

function getQueryPriceMax(query: string): number | undefined {
  const match = query.match(PRICE_QUERY_TERMS);
  if (!match) {
    return undefined;
  }

  const value = Number(match[1].replace(/,/g, ''));
  return Number.isFinite(value) ? value : undefined;
}

function hasRecipeIntent(query: string): boolean {
  return /\b(recipe|cook|cooking|make\b|ingredients?|meal plan|what do i need|how do i make)\b/i.test(query);
}

function hasShoppingPlannerIntent(query: string): boolean {
  return /\b(family|weekly|shopping list|groceries|party|birthday|for\s+\d+\s+people|meal prep)\b/i.test(query);
}

function inferRecipeKey(query: string): keyof typeof RECIPE_LIBRARY | undefined {
  const normalized = normalizeText(query);
  if (normalized.includes('pizza')) return 'pizza';
  if (normalized.includes('chapati')) return 'chapati';
  if (normalized.includes('fried rice')) return 'fried rice';
  if (normalized.includes('breakfast')) return 'breakfast';
  if (normalized.includes('birthday party') || normalized.includes('birthday')) return 'birthday party';
  if (normalized.includes('healthy snack')) return 'healthy snacks';
  if (normalized.includes('grocer')) return 'groceries';
  return undefined;
}

function inferShoppingKey(query: string): keyof typeof RECIPE_LIBRARY | undefined {
  const normalized = normalizeText(query);
  if (normalized.includes('breakfast')) return 'breakfast';
  if (normalized.includes('birthday') || normalized.includes('party')) return 'birthday party';
  if (normalized.includes('healthy snack')) return 'healthy snacks';
  if (normalized.includes('grocer') || normalized.includes('weekly') || normalized.includes('family')) return 'groceries';
  return undefined;
}

function getSearchTokensForIntent(query: string, intent: SimbaIntent): string[] {
  const normalized = normalizeText(query);
  const terms = getSpecificTerms(query);

  if (intent === 'recipe_assistant') {
    const key = inferRecipeKey(query);
    const recipe = key ? RECIPE_LIBRARY[key] : undefined;
    return unique([...(recipe?.ingredients || []), ...terms]);
  }

  if (intent === 'shopping_planner') {
    const key = inferShoppingKey(query);
    const plan = key ? RECIPE_LIBRARY[key] : undefined;
    return unique([...(plan?.ingredients || []), ...terms]);
  }

  if (intent === 'cart_builder') {
    return unique([...terms, ...(normalized.includes('cheap') || normalized.includes('budget') ? ['price', 'discount', 'sale'] : [])]);
  }

  if (intent === 'product_expert') {
    return unique([...terms, 'compare', 'difference', 'best', 'quality', 'value']);
  }

  if (intent === 'branch_assistant') {
    return unique([...terms, 'branch', 'available', 'stock', 'nearby']);
  }

  return terms;
}

function getSupportCandidate(query: string, branch?: string, context?: SimbaAssistantContext) {
  return isSupportIntent(query, context) || isOrderTrackingIntent(query, context)
    ? getSupportResponse(query, branch, context)
    : undefined;
}

function buildRankingStrategy(intent: SimbaIntent, query: string): RankingStrategy {
  const normalized = normalizeText(query);
  if (intent === 'cart_builder') {
    return 'price-asc';
  }

  if (intent === 'product_expert') {
    return 'rating';
  }

  if (intent === 'recipe_assistant' || intent === 'shopping_planner') {
    return DEAL_QUERY_TERMS.test(normalized) ? 'discount' : 'popular';
  }

  if (intent === 'recommendation_request') {
    return DEAL_QUERY_TERMS.test(normalized) ? 'discount' : 'rating';
  }

  if (intent === 'product_search' || intent === 'branch_assistant') {
    return 'popular';
  }

  return 'popular';
}

function buildSuggestions(intent: SimbaIntent): string[] {
  switch (intent) {
    case 'recipe_assistant':
      return ['Add ingredients to cart', 'Show cheaper substitutions', 'Switch the branch if stock is low'];
    case 'shopping_planner':
      return ['Build the shopping list', 'Optimize for budget', 'Keep to the selected branch'];
    case 'customer_support':
    case 'support_question':
      return ['Open support', 'Check order history', 'Review delivery and return help'];
    case 'order_tracking':
      return ['Open your account orders', 'Track delivery status', 'Review cancellation or refund rules'];
    case 'cart_builder':
      return ['Make the cart cheaper', 'Remove expensive items', 'Replace with lower-cost alternatives'];
    case 'product_expert':
      return ['Compare similar items', 'Show healthier choices', 'Check branch availability'];
    case 'branch_assistant':
      return ['Show stock for this branch', 'Find the nearest branch with stock', 'Switch branch'];
    case 'recommendation_request':
      return ['Browse best sellers', 'Filter by price', 'Look for branch-stocked items'];
    case 'product_search':
      return ['Filter by category', 'Sort by rating', 'Try a more specific product name'];
    default:
      return ['Ask about products', 'Try a shopping question', 'Request deals or ideas'];
  }
}

function buildExplanation(intent: SimbaIntent, query: string, context?: SimbaAssistantContext): string {
  const page = context?.pageType ? ` on the ${context.pageType} page` : '';
  if (!query.trim()) {
    return `Using the selected branch${page} to surface the most relevant Simba products and actions.`;
  }

  switch (intent) {
    case 'recipe_assistant':
      return `Detected a recipe request${page} and matched ingredients to in-stock Simba products.`;
    case 'shopping_planner':
      return `Detected a shopping plan request${page} and built a branch-aware list around the intended meal or event.`;
    case 'customer_support':
    case 'support_question':
      return `Detected a support question${page} and prioritized help, policies, and order/account guidance.`;
    case 'order_tracking':
      return `Detected an order tracking request${page} and surfaced order help with support links.`;
    case 'cart_builder':
      return `Detected a cart optimization request${page} and focused on cheaper or better-fitting alternatives.`;
    case 'product_expert':
      return `Detected a product comparison request${page} and prioritized descriptions, ratings, and branch stock.`;
    case 'branch_assistant':
      return `Detected a branch-aware request${page} and prioritized inventory available at the selected branch.`;
    case 'recommendation_request':
      return `Detected a recommendation request${page} and will use catalog quality, value, and availability to suggest items.`;
    case 'product_search':
      return `Detected a product search query${page} and matched items using catalog text, inventory, and branch availability.`;
    default:
      return `Using the Simba intelligence layer to match your request with the best available products and support advice.`;
  }
}

function buildConfidence(intent: SimbaIntent, query: string, productsMatched: number, context?: SimbaAssistantContext, recipePlan?: RecipePlan | ShoppingPlan): number {
  if (!query.trim()) {
    return 0.55;
  }

  if (productsMatched > 0) {
    return Math.min(0.98, 0.68 + productsMatched * 0.06);
  }

  if (intent === 'general_chat') {
    return 0.72;
  }

  if (intent === 'customer_support' || intent === 'support_question' || intent === 'order_tracking') {
    return 0.86;
  }

  if (recipePlan) {
    const coverage = 'missingIngredients' in recipePlan && recipePlan.ingredients.length > 0
      ? 1 - recipePlan.missingIngredients.length / recipePlan.ingredients.length
      : 0.8;
    return Math.max(0.7, Math.min(0.96, 0.78 + coverage * 0.18));
  }

  const terms = getSpecificTerms(query);
  if (terms.length >= 3) {
    return 0.85;
  }
  if (terms.length >= 2) {
    return 0.79;
  }

  if (context?.pageType === 'cart' || context?.pageType === 'checkout') {
    return 0.8;
  }

  return 0.68;
}

function buildRecipePlan(query: string, products: Product[], branch?: string): RecipePlan | undefined {
  const key = inferRecipeKey(query);
  if (!key) {
    return undefined;
  }

  const template = RECIPE_LIBRARY[key];
  const matchedIngredients = template.ingredients.map((ingredient) => {
    const matches = buildLocalConversationalMatches(ingredient, products, 3, branch);
    return {
      ingredient,
      productIds: matches.map((product) => product.id),
      primaryProductId: matches[0]?.id ?? null,
      primaryProductName: matches[0]?.name ?? null,
    };
  });

  const addAllProductIds = unique(matchedIngredients.flatMap((item) => item.productIds)).slice(0, 12);
  const missingIngredients = matchedIngredients
    .filter((item) => item.productIds.length === 0)
    .map((item) => item.ingredient);

  return {
    ...template,
    matchedIngredients,
    missingIngredients,
    addAllProductIds,
    budgetHint: getQueryPriceMax(query) || null,
  };
}

function buildShoppingPlan(query: string, products: Product[], branch?: string): ShoppingPlan | undefined {
  const key = inferShoppingKey(query);
  if (!key) {
    return undefined;
  }

  const template = RECIPE_LIBRARY[key];
  const peopleMatch = query.match(/\b(\d+)\s+people\b/i);
  const peopleCount = peopleMatch ? Number(peopleMatch[1]) : undefined;
  const matchedItems = template.ingredients.map((item) => {
    const matches = buildLocalConversationalMatches(item, products, 3, branch);
    return {
      item,
      productIds: matches.map((product) => product.id),
      primaryProductId: matches[0]?.id ?? null,
      primaryProductName: matches[0]?.name ?? null,
    };
  });

  const addAllProductIds = unique(matchedItems.flatMap((item) => item.productIds)).slice(0, 12);
  const missingItems = matchedItems.filter((item) => item.productIds.length === 0).map((item) => item.item);

  return {
    title: template.title,
    query: template.query,
    peopleCount,
    items: template.ingredients,
    matchedItems,
    missingItems,
    addAllProductIds,
    budgetHint: getQueryPriceMax(query) || null,
  };
}

function buildCartOptimizationPlan(query: string, products: Product[], branch?: string, cartItems?: CartItem[]): AssistantAction[] {
  const lower = normalizeText(query);
  if (!cartItems || cartItems.length === 0) {
    return [];
  }

  const actions: AssistantAction[] = [];

  if (!CHEAP_QUERY_TERMS.test(lower)) {
    return actions;
  }

  const cheaperCandidates = cartItems
    .map((item) => {
      const categoryMatches = buildLocalConversationalMatches(item.product_name, products, 6, branch);
      const cheaper = categoryMatches
        .filter((candidate) => candidate.id !== item.product_id)
        .filter((candidate) => candidate.price < item.price)
        .sort((a, b) => a.price - b.price || b.rating - a.rating)[0];

      return cheaper
        ? { item, replacement: cheaper }
        : null;
    })
    .filter((entry): entry is { item: CartItem; replacement: Product } => Boolean(entry));

  if (cheaperCandidates.length > 0) {
    actions.push({
      type: 'REPLACE_CART_ITEMS',
      label: 'Apply cheaper swaps',
      description: 'Replace expensive items with lower-cost alternatives that are still relevant.',
      productIds: cheaperCandidates.map((entry) => entry.item.product_id),
      replacementProductIds: cheaperCandidates.map((entry) => entry.replacement.id),
    });
  }

  return actions;
}

function buildBranchAction(branch?: string): AssistantAction[] {
  return branch
    ? [
        {
          type: 'SET_BRANCH',
          label: `Use ${branch}`,
          branch,
          description: 'Keep the assistant focused on the selected branch inventory.',
        },
      ]
    : [];
}

function buildPageHint(context?: SimbaAssistantContext, intent?: SimbaIntent): string | undefined {
  switch (context?.pageType) {
    case 'home':
      return 'Use the assistant to explore categories, promotions, and popular products.';
    case 'shop':
      return 'Use the assistant to refine product discovery and filter by branch availability.';
    case 'product':
      return 'Use the assistant to compare products, find complements, and check branch stock.';
    case 'cart':
      return 'Use the assistant to trim the cart, suggest alternatives, or add missing items.';
    case 'checkout':
      return 'Use the assistant for delivery, payment, and order help.';
    case 'order':
      return 'Use the assistant to explain order status or suggest support next steps.';
    case 'admin':
      return 'Use the assistant for branch-aware operational help and inventory context.';
    case 'support':
      return 'Use the assistant for policies, help, and account guidance.';
    default:
      return intent === 'recipe_assistant'
        ? 'Use the assistant to turn a recipe into a shopping list.'
        : undefined;
  }
}

export function buildSearchPlan(
  query: string,
  branch?: string,
  selectedProductIds?: number[],
  context?: SimbaAssistantContext,
  products: Product[] = []
): SimbaSearchPlan {
  const normalizedQuery = query.trim();
  const assistantContext: SimbaAssistantContext = {
    ...context,
    branch: context?.branch || branch,
  };
  const intent = classifyIntent(normalizedQuery, assistantContext);
  const pageType = assistantContext.pageType || (context?.pageType as AssistantPageType | undefined);
  const ranking = buildRankingStrategy(intent, normalizedQuery);
  const support = getSupportCandidate(normalizedQuery, branch, assistantContext);
  const recipe = buildRecipePlan(normalizedQuery, products, branch);
  const shoppingPlan = buildShoppingPlan(normalizedQuery, products, branch);
  const suggestions = buildSuggestions(intent);
  const explanation = buildExplanation(intent, normalizedQuery, assistantContext);
  const confidence = buildConfidence(intent, normalizedQuery, 0, assistantContext, recipe || shoppingPlan);
  const pageHint = buildPageHint(assistantContext, intent);

  const options: ProductQueryOptions = {
    sort: ranking,
    limit: Math.min(DEFAULT_LIMIT, Math.max(1, selectedProductIds?.length || DEFAULT_LIMIT)),
  };

  const priceMax = getQueryPriceMax(normalizedQuery);
  if (typeof priceMax === 'number') {
    options.priceMax = priceMax;
  }

  if (selectedProductIds && selectedProductIds.length > 0) {
    options.ids = selectedProductIds;
    options.limit = selectedProductIds.length;
  } else if (intent === 'recipe_assistant' || intent === 'shopping_planner') {
    options.query = getSearchTokensForIntent(normalizedQuery, intent).join(' ');
    options.limit = DEFAULT_LIMIT;
    if (DEAL_QUERY_TERMS.test(normalizedQuery)) {
      options.saleOnly = true;
    }
  } else if (intent === 'cart_builder' || intent === 'product_expert' || intent === 'branch_assistant' || intent === 'product_search' || intent === 'recommendation_request') {
    options.query = getSearchTokensForIntent(normalizedQuery, intent).join(' ');
    options.limit = DEFAULT_LIMIT;
    if (CHEAP_QUERY_TERMS.test(normalizedQuery) || DEAL_QUERY_TERMS.test(normalizedQuery)) {
      options.sort = 'price-asc';
    }
    if (DEAL_QUERY_TERMS.test(normalizedQuery)) {
      options.saleOnly = true;
    }
  } else {
    options.query = normalizedQuery;
    options.limit = DEFAULT_LIMIT;
  }

  const actions: AssistantAction[] = [
    ...buildBranchAction(branch || assistantContext.branch || undefined),
  ];

  if (support?.supportUrl) {
    actions.push({
      type: 'OPEN_SUPPORT',
      label: 'Open support',
      route: support.supportUrl,
      description: 'Go to the Simba support page for policies and help.',
    });
  }

  if (selectedProductIds && selectedProductIds.length > 0) {
    actions.push({
      type: 'APPLY_SEARCH',
      label: 'Open selected products',
      query: normalizedQuery,
      productIds: selectedProductIds,
      description: 'Show the selected products on the shop page.',
    });
  }

  if (intent === 'recipe_assistant' && recipe) {
    actions.push({
      type: 'ADD_TO_CART',
      label: 'Add recipe ingredients',
      productIds: recipe.addAllProductIds,
      description: 'Add the matched ingredients to the cart.',
    });
  }

  if (intent === 'shopping_planner' && shoppingPlan) {
    actions.push({
      type: 'ADD_TO_CART',
      label: 'Add shopping list',
      productIds: shoppingPlan.addAllProductIds,
      description: 'Add the matched shopping list to the cart.',
    });
  }

  if (intent === 'order_tracking') {
    actions.push({
      type: 'VIEW_ORDER',
      label: 'Open orders',
      route: '/account?tab=orders',
      description: 'Jump to the order history and tracking area.',
    });
  }

  if (intent === 'cart_builder') {
    actions.push({
      type: 'OPEN_CHECKOUT',
      label: 'Review checkout',
      route: '/checkout',
      description: 'Move to checkout when the cart is ready.',
    });
  }

  return {
    intent,
    mode: intent,
    query: normalizedQuery,
    branch,
    pageType,
    pageTitle: assistantContext.pageTitle,
    options,
    ranking,
    useFallbackLocalSearch: true,
    supportReply: support?.supportReply,
    supportUrl: support?.supportUrl,
    explanation,
    suggestions,
    confidence,
    selectedProductIds,
    actions,
    recipe,
    shoppingPlan,
    pageHint,
  };
}

function scoreProduct(query: string, product: Product, branch?: string, intent?: SimbaIntent): number {
  const normalizedQuery = normalizeText(query);
  const semanticText = buildProductSemanticText(product, branch);
  const semanticTokens = tokenize(semanticText);
  const queryTerms = getSpecificTerms(query);
  const categoryTerms = categoryKeywords(product.category);
  const tags = parseStringList(product.tags);
  const descriptionTerms = tokenize(product.description || '');
  const nameTerms = tokenize(product.name || '');
  const branchStock = branch ? getProductStockForBranch(product, branch) : getProductStockForBranch(product);

  if (branch && branchStock <= 0 && product.branch_stock) {
    return 0;
  }

  const intentTerms = getSearchTokensForIntent(query, intent || classifyIntent(query));
  const intentMatch = scoreOverlap(queryTerms.length > 0 ? queryTerms : intentTerms, semanticTokens);
  const descriptionMatch = scoreOverlap(queryTerms, descriptionTerms);
  const categoryMatch = scoreOverlap(queryTerms, categoryTerms);
  const tagsMatch = scoreOverlap(queryTerms, tags);
  const branchAvailability = branchStock > 0 ? 1 : product.in_stock ? 0.9 : 0;
  const popularity = Math.max(
    0,
    Math.min(
      1,
      ((Number(product.rating || 0) / 5) * 0.6)
      + (product.best_seller ? 0.15 : 0)
      + (Number(product.discount || 0) > 0 ? 0.15 : 0)
      + (product.featured ? 0.1 : 0)
    )
  );

  const queryStrength = queryTerms.length > 0 ? Math.min(1, queryTerms.length / 6) : 0.2;
  let score = (intentMatch * 0.4)
    + (descriptionMatch * 0.25)
    + (categoryMatch * 0.15)
    + (tagsMatch * 0.1)
    + (branchAvailability * 0.05)
    + (popularity * 0.05);

  if (normalizedQuery && semanticText.includes(normalizedQuery)) {
    score = Math.max(score, 0.85);
  }

  if (intent === 'cart_builder' && queryStrength > 0) {
    score += 0.05;
  }

  if (intent === 'recipe_assistant' || intent === 'shopping_planner') {
    score += Math.min(0.1, queryStrength * 0.08);
  }

  if (queryStrength < 0.2 && score < MIN_RELEVANCE) {
    return 0;
  }

  if (score < MIN_RELEVANCE) {
    return 0;
  }

  return Math.min(score, 1);
}

export function isProductRelevantToQuery(query: string, product: Product, branch?: string, context?: SimbaAssistantContext): boolean {
  return scoreProduct(query, product, branch, context ? classifyIntent(query, context) : undefined) >= MIN_RELEVANCE;
}

export function buildLocalConversationalMatches(
  query: string,
  products: Product[],
  limit: number = 8,
  branch?: string,
  context?: SimbaAssistantContext
): Product[] {
  const intent = classifyIntent(query, context);
  return [...products]
    .map((product) => ({ product, score: scoreProduct(query, product, branch, intent) }))
    .filter((entry) => entry.score >= MIN_RELEVANCE)
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
  branch?: string,
  context?: SimbaAssistantContext
): {
  products: Product[];
  productIds: number[];
  supportReply?: string;
  supportUrl?: string;
  branchMessage: string;
  recipe?: RecipePlan;
  shoppingPlan?: ShoppingPlan;
  actions: AssistantAction[];
} {
  const intent = classifyIntent(query, context);
  const matches = buildLocalConversationalMatches(query, products, limit, branch, context);
  const support = isSupportIntent(query, context) ? getSupportResponse(query, branch, context) : undefined;
  const recipe = intent === 'recipe_assistant' ? buildRecipePlan(query, products, branch) : undefined;
  const shoppingPlan = intent === 'shopping_planner' ? buildShoppingPlan(query, products, branch) : undefined;
  const branchMessage = branch ? ` available at ${branch}` : '';
  const cartActions = buildCartOptimizationPlan(query, products, branch, context?.cartItems);
  const actions: AssistantAction[] = [];

  if (recipe?.addAllProductIds?.length) {
    actions.push({
      type: 'ADD_TO_CART',
      label: 'Add recipe ingredients',
      productIds: recipe.addAllProductIds,
    });
  }

  if (shoppingPlan?.addAllProductIds?.length) {
    actions.push({
      type: 'ADD_TO_CART',
      label: 'Add shopping list',
      productIds: shoppingPlan.addAllProductIds,
    });
  }

  if (support?.supportUrl) {
    actions.push({
      type: 'OPEN_SUPPORT',
      label: 'Open support',
      route: support.supportUrl,
    });
  }

  actions.push(...cartActions);

  return {
    products: matches,
    productIds: matches.map((product) => product.id),
    supportReply: support?.supportReply,
    supportUrl: support?.supportUrl,
    branchMessage,
    recipe,
    shoppingPlan,
    actions,
  };
}
