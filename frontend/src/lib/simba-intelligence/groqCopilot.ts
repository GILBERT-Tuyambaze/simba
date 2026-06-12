import { getProductStockForBranch } from '@/lib/product-stock';
import type { CartItem, Product } from '@/lib/types';
import { classifyIntent, type AssistantPageType, type SimbaIntent } from './intentClassifier';
import {
  buildProductSemanticText,
  type AssistantAction,
  type RecipePlan,
  type ShoppingPlan,
  type SimbaAssistantContext,
} from './queryPlanner';

export type CopilotV3Intent =
  | 'shopping'
  | 'recipe'
  | 'meal_planning'
  | 'cart_optimization'
  | 'promotion_search'
  | 'product_comparison'
  | 'support'
  | 'order_tracking'
  | 'account_help'
  | 'inventory_check'
  | 'general_chat';

type CopilotNlu = {
  intent?: string;
  entities?: Record<string, unknown>;
  products?: string[];
  categories?: string[];
  meals?: string[];
  budget?: number | null;
  quantity?: number | null;
  branch_reference?: string | null;
  urgency?: string | null;
  user_goal?: string;
  shopping_context?: string;
  constraints?: string[];
  followup_reference?: string | null;
  confidence?: number;
};

type CopilotIntentResult = {
  intent: CopilotV3Intent;
  confidence: number;
  secondary_intents?: CopilotV3Intent[];
  reason?: string;
};

type CopilotRetrievalInstructions = {
  expanded_queries?: string[];
  product_terms?: string[];
  category_terms?: string[];
  brand_terms?: string[];
  required_categories?: string[];
  excluded_categories?: string[];
  meal_ideas?: string[];
  retrieval_strategy?: string;
  semantic_filters?: string[];
};

type CopilotEvaluation = {
  productId: number;
  relevanceScore?: number;
  confidenceScore?: number;
  dimensions?: {
    relevance?: number;
    availability?: number;
    priceSuitability?: number;
    mealSuitability?: number;
    cartSuitability?: number;
    branchSuitability?: number;
    userGoalSuitability?: number;
  };
  reasons?: string[];
};

type CopilotReasoning = {
  advisor_summary?: string;
  meal_ideas?: string[];
  shopping_list?: string[];
  budget_estimate?: number | null;
  savings_estimate?: number | null;
  comparisons?: string[];
  substitutions?: Array<{
    originalProductId?: number;
    replacementProductId?: number;
    reason?: string;
    savings?: number;
  }>;
  missing_items?: string[];
  add_all_product_ids?: number[];
  suggested_actions?: AssistantAction[];
  follow_up_question?: string | null;
  memory_updates?: Record<string, unknown>;
};

type CopilotFinalResponse = {
  message?: string;
  product_ids?: number[];
  explanation?: string;
  suggestions?: string[];
  actions?: AssistantAction[];
  recipe?: RecipePlan;
  shopping_plan?: ShoppingPlan;
  support_reply?: string;
  support_url?: string;
};

type ProductCandidate = {
  product: Product;
  score: number;
  reasons: string[];
};

type ProductSummary = {
  id: number;
  name: string;
  description: string | null | undefined;
  category: string;
  brand: string | null | undefined;
  tags: string[];
  keywords: string[];
  price: number;
  discountedPrice: number;
  discount: number;
  rating: number;
  inStock: boolean;
  totalStock: number;
  branchStock: number;
  onSale: boolean;
};

export type GroqCopilotResult = {
  intent: CopilotV3Intent;
  mode: CopilotV3Intent;
  confidence: number;
  message: string;
  explanation: string;
  suggestions: string[];
  products: Product[];
  productIds: number[];
  actions: AssistantAction[];
  recipe?: RecipePlan;
  shoppingPlan?: ShoppingPlan;
  supportReply?: string;
  supportUrl?: string;
  nlu: CopilotNlu;
  retrievalInstructions: CopilotRetrievalInstructions;
  evaluations: CopilotEvaluation[];
  reasoning: CopilotReasoning;
};

export type GroqCopilotInput = {
  query: string;
  catalog: Product[];
  limit: number;
  branch?: string;
  context?: SimbaAssistantContext & {
    memory?: Record<string, unknown>;
    user?: Record<string, unknown>;
  };
  cartItems?: CartItem[];
  history?: Array<{ role: 'assistant' | 'user'; text: string; products?: Product[]; query?: string }>;
  lastViewedProducts?: number[];
  recentSearches?: string[];
};

const MAX_CANDIDATES_FOR_GROQ = 50;
const MAX_SELECTED_PRODUCTS = 12;
const DEFAULT_MODEL = 'llama-3.3-70b-versatile';
const FOOD_INTENTS = new Set<CopilotV3Intent>(['shopping', 'recipe', 'meal_planning']);
const FOOD_HINTS = [
  'food',
  'grocery',
  'groceries',
  'meal',
  'snack',
  'ingredient',
  'dairy',
  'milk',
  'cheese',
  'yogurt',
  'butter',
  'beverage',
  'drink',
  'tea',
  'coffee',
  'juice',
  'water',
  'bakery',
  'bread',
  'flour',
  'rice',
  'beans',
  'pasta',
  'tomato',
  'sauce',
  'oil',
  'salt',
  'spice',
  'vegetable',
  'fruit',
  'meat',
  'chicken',
  'fish',
  'egg',
  'cereal',
  'oats',
  'nuts',
  'biscuit',
  'pizza',
];
const NON_FOOD_HINTS = [
  'baby',
  'diaper',
  'nappy',
  'detergent',
  'soap',
  'laundry',
  'cleaning',
  'bleach',
  'battery',
  'electronics',
  'phone',
  'charger',
  'beauty',
  'skincare',
];
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'be',
  'can',
  'do',
  'for',
  'from',
  'have',
  'help',
  'i',
  'in',
  'is',
  'it',
  'make',
  'me',
  'my',
  'need',
  'of',
  'on',
  'please',
  'show',
  'the',
  'to',
  'tonight',
  'we',
  'what',
  'with',
  'you',
]);

const RECIPE_INGREDIENTS: Record<string, string[]> = {
  pizza: ['flour', 'yeast', 'mozzarella', 'cheese', 'tomato sauce', 'olive oil', 'salt'],
  breakfast: ['milk', 'bread', 'eggs', 'tea', 'coffee', 'butter', 'cereal', 'oats'],
  lunch: ['rice', 'beans', 'chicken', 'vegetables', 'bread', 'tomato', 'oil', 'salt'],
  dinner: ['rice', 'pasta', 'chicken', 'vegetables', 'beans', 'oil', 'spices'],
  'fried rice': ['rice', 'eggs', 'carrot', 'onion', 'peas', 'soy sauce', 'oil'],
  chapati: ['flour', 'oil', 'salt'],
  tea: ['black tea', 'green tea', 'herbal tea', 'tea bags', 'milk', 'sugar'],
  milk: ['fresh milk', 'long life milk', 'powdered milk', 'dairy milk'],
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

function clamp01(value: unknown, fallback = 0.5): number {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, number));
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
      return value.split(',').map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
}

function getSearchTerms(value: string): string[] {
  return unique(tokenize(value).filter((term) => term.length >= 2 && !STOP_WORDS.has(term)));
}

function overlapScore(source: string[], target: string[]): number {
  if (source.length === 0 || target.length === 0) {
    return 0;
  }
  const targetSet = new Set(target);
  const matched = source.filter((term) => (
    targetSet.has(term) || target.some((candidate) => candidate.startsWith(term) || term.startsWith(candidate))
  ));
  return matched.length / source.length;
}

function getDiscountedPrice(product: Product): number {
  const price = Number(product.price || 0);
  const discount = Number(product.discount || 0);
  return Math.max(0, Math.round(discount > 0 ? price * (1 - discount / 100) : price));
}

function getProductKeywords(product: Product): string[] {
  return unique([
    ...tokenize(product.name || ''),
    ...tokenize(product.description || ''),
    ...tokenize(product.category || ''),
    ...tokenize(product.brand || ''),
    ...parseStringList(product.tags).flatMap(tokenize),
    ...parseStringList(product.options).flatMap(tokenize),
    ...parseStringList(product.addons).flatMap(tokenize),
    ...parseStringList(product.modifiers).flatMap(tokenize),
  ]).filter((term) => term.length >= 2);
}

function summarizeProduct(product: Product, branch?: string): ProductSummary {
  const branchStock = getProductStockForBranch(product, branch);
  const totalStock = getProductStockForBranch(product);
  return {
    id: Number(product.id),
    name: product.name,
    description: product.description,
    category: product.category,
    brand: product.brand,
    tags: parseStringList(product.tags).slice(0, 12),
    keywords: getProductKeywords(product).slice(0, 24),
    price: Number(product.price || 0),
    discountedPrice: getDiscountedPrice(product),
    discount: Number(product.discount || 0),
    rating: Number(product.rating || 0),
    inStock: branch ? branchStock > 0 : Boolean(product.in_stock),
    totalStock,
    branchStock,
    onSale: Boolean(product.on_sale || Number(product.discount || 0) > 0),
  };
}

function buildCatalogProfile(catalog: Product[]) {
  const categories = unique(catalog.map((product) => product.category).filter(Boolean)).sort().slice(0, 80);
  const brands = unique(catalog.map((product) => product.brand || '').filter(Boolean)).sort().slice(0, 80);
  const tags = unique(catalog.flatMap((product) => parseStringList(product.tags))).sort().slice(0, 120);
  return {
    total_products: catalog.length,
    categories,
    brands,
    tags,
    inventory_fields: ['branch_stock', 'stock_count', 'in_stock', 'discount', 'rating'],
    searchable_fields: ['name', 'description', 'category', 'brand', 'tags', 'options', 'addons', 'modifiers'],
  };
}

function buildContextSnapshot(input: GroqCopilotInput) {
  return {
    current_page: input.context?.pageType || 'unknown',
    current_page_title: input.context?.pageTitle,
    current_branch: input.branch || input.context?.branch,
    current_role: input.context?.currentUserRole || input.context?.user?.role || 'guest',
    cart: (input.cartItems || []).slice(0, 24).map((item) => ({
      product_id: item.product_id,
      product_name: item.product_name,
      price: item.price,
      quantity: item.quantity,
      branch: item.branch,
      unit: item.unit,
    })),
    cart_summary: input.context?.cartSummary,
    conversation_memory: input.context?.memory || {},
    conversation_history: (input.history || []).slice(-10).map((message) => ({
      role: message.role,
      text: message.text,
      query: message.query,
      product_ids: message.products?.map((product) => product.id).slice(0, 8),
    })),
    last_viewed_products: input.lastViewedProducts || [],
    recent_searches: input.recentSearches || [],
  };
}

function extractJsonObject(raw: string): unknown | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function callGroqJson<T>(stage: string, system: string, payload: unknown, maxTokens = 900): Promise<T | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const response = await fetch(`${process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL || DEFAULT_MODEL,
      temperature: stage === 'response_generation' ? 0.35 : 0.15,
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: system,
        },
        {
          role: 'user',
          content: JSON.stringify(payload),
        },
      ],
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw !== 'string') {
    return null;
  }

  return extractJsonObject(raw) as T | null;
}

function mapLegacyIntent(intent: SimbaIntent): CopilotV3Intent {
  switch (intent) {
    case 'recipe_assistant':
      return 'recipe';
    case 'shopping_planner':
      return 'meal_planning';
    case 'cart_builder':
      return 'cart_optimization';
    case 'product_expert':
      return 'product_comparison';
    case 'branch_assistant':
      return 'inventory_check';
    case 'customer_support':
    case 'support_question':
      return 'support';
    case 'order_tracking':
      return 'order_tracking';
    case 'general_chat':
      return 'general_chat';
    case 'recommendation_request':
    case 'product_search':
    default:
      return 'shopping';
  }
}

function fallbackNlu(query: string, context?: SimbaAssistantContext): CopilotNlu {
  const terms = getSearchTerms(query);
  const budget = query.match(/\b(?:under|below|max|maximum)\s+([0-9][0-9,]*)\b/i);
  const people = query.match(/\b(?:family of|for)\s+(\d+)\b/i);
  const meals = ['breakfast', 'lunch', 'dinner', 'pizza', 'tea', 'snack'].filter((term) => normalizeText(query).includes(term));
  return {
    intent: mapLegacyIntent(classifyIntent(query, context)),
    entities: {},
    products: terms,
    categories: [],
    meals,
    budget: budget ? Number(budget[1].replace(/,/g, '')) : null,
    quantity: people ? Number(people[1]) : null,
    branch_reference: context?.branch || null,
    urgency: normalizeText(query).includes('tonight') ? 'tonight' : null,
    user_goal: query,
    shopping_context: context?.pageType || 'assistant',
    constraints: [],
    followup_reference: /\b(it|that|everything|all of it|add everything)\b/i.test(query) ? 'previous_goal' : null,
    confidence: 0.7,
  };
}

function normalizeIntent(value: unknown, fallback: CopilotV3Intent): CopilotV3Intent {
  const normalized = String(value || '').trim().toLowerCase().replace(/[-\s]+/g, '_');
  const allowed: CopilotV3Intent[] = [
    'shopping',
    'recipe',
    'meal_planning',
    'cart_optimization',
    'promotion_search',
    'product_comparison',
    'support',
    'order_tracking',
    'account_help',
    'inventory_check',
    'general_chat',
  ];
  return allowed.includes(normalized as CopilotV3Intent) ? normalized as CopilotV3Intent : fallback;
}

function fallbackIntent(query: string, nlu: CopilotNlu, context?: SimbaAssistantContext): CopilotIntentResult {
  const normalized = normalizeText(query);
  let intent = normalizeIntent(nlu.intent, mapLegacyIntent(classifyIntent(query, context)));
  if (/\b(promo|promos|promotion|discount|sale|deal|deals)\b/.test(normalized)) {
    intent = 'promotion_search';
  }
  if (/\b(account|login|password|email|profile)\b/.test(normalized)) {
    intent = 'account_help';
  }
  return {
    intent,
    confidence: clamp01(nlu.confidence, 0.72),
    secondary_intents: [],
    reason: 'Fallback intent derived from local context.',
  };
}

function expandKnownTerms(query: string, nlu: CopilotNlu, intent: CopilotV3Intent): string[] {
  const normalized = normalizeText(query);
  const terms = [...getSearchTerms(query), ...(nlu.products || []), ...(nlu.meals || [])];

  for (const [key, ingredients] of Object.entries(RECIPE_INGREDIENTS)) {
    if (normalized.includes(key) || nlu.products?.some((product) => normalizeText(product).includes(key))) {
      terms.push(...ingredients);
    }
  }

  if (intent === 'meal_planning' && /lunch/.test(normalized)) {
    terms.push(...RECIPE_INGREDIENTS.lunch, 'sandwich', 'beans', 'vegetables');
  }
  if (intent === 'meal_planning' && /breakfast/.test(normalized)) {
    terms.push(...RECIPE_INGREDIENTS.breakfast);
  }
  if (intent === 'promotion_search') {
    terms.push('sale', 'discount', 'deal', 'promo');
  }

  return unique(terms.map(normalizeText).filter(Boolean));
}

function fallbackRetrievalInstructions(query: string, nlu: CopilotNlu, intent: CopilotV3Intent): CopilotRetrievalInstructions {
  const expanded = expandKnownTerms(query, nlu, intent);
  return {
    expanded_queries: unique([query, ...expanded]).filter(Boolean),
    product_terms: expanded,
    category_terms: intent === 'recipe' || intent === 'meal_planning' ? ['food', 'dairy', 'beverages', 'bakery'] : nlu.categories || [],
    brand_terms: [],
    required_categories: [],
    excluded_categories: intent === 'recipe' || intent === 'meal_planning'
      ? ['baby', 'cleaning', 'detergent', 'electronics', 'beauty']
      : [],
    meal_ideas: nlu.meals,
    retrieval_strategy: 'Search semantic catalog fields and branch inventory, not product name alone.',
    semantic_filters: [],
  };
}

function isExcludedCategory(product: Product, instructions: CopilotRetrievalInstructions): boolean {
  const category = normalizeText(product.category);
  return (instructions.excluded_categories || []).some((excluded) => category.includes(normalizeText(excluded)));
}

function isLikelyFoodProduct(product: Product): boolean {
  const text = buildProductSemanticText(product);
  const hasFoodHint = FOOD_HINTS.some((term) => text.includes(term));
  const hasNonFoodHint = NON_FOOD_HINTS.some((term) => text.includes(term));
  return hasFoodHint && !hasNonFoodHint;
}

function scoreCandidate(
  query: string,
  product: Product,
  intent: CopilotV3Intent,
  instructions: CopilotRetrievalInstructions,
  nlu: CopilotNlu,
  branch?: string,
  cartItems: CartItem[] = []
): ProductCandidate | null {
  if (isExcludedCategory(product, instructions)) {
    return null;
  }

  if ((intent === 'recipe' || intent === 'meal_planning') && !isLikelyFoodProduct(product)) {
    return null;
  }

  const semanticText = buildProductSemanticText(product, branch);
  const semanticTokens = tokenize(semanticText);
  const nameTokens = tokenize(product.name || '');
  const descriptionTokens = tokenize(product.description || '');
  const categoryTokens = tokenize(product.category || '');
  const tags = parseStringList(product.tags).flatMap(tokenize);
  const expandedTerms = unique([
    ...expandKnownTerms(query, nlu, intent),
    ...(instructions.expanded_queries || []).flatMap(getSearchTerms),
    ...(instructions.product_terms || []).flatMap(getSearchTerms),
    ...(instructions.category_terms || []).flatMap(getSearchTerms),
    ...(instructions.brand_terms || []).flatMap(getSearchTerms),
  ]);
  const effectiveTerms = expandedTerms.length > 0 ? expandedTerms : getSearchTerms(query);
  const branchStock = getProductStockForBranch(product, branch);
  const availability = branch ? (branchStock > 0 ? 1 : 0) : product.in_stock ? 1 : 0;
  const discount = Number(product.discount || 0);
  const rating = Math.max(0, Math.min(1, Number(product.rating || 0) / 5));
  const onSale = product.on_sale || discount > 0;
  const overBudget = typeof nlu.budget === 'number' && nlu.budget > 0 && getDiscountedPrice(product) > nlu.budget;
  const cartTerms = cartItems.flatMap((item) => getSearchTerms(item.product_name));

  let score =
    overlapScore(effectiveTerms, semanticTokens) * 0.34 +
    overlapScore(effectiveTerms, descriptionTokens) * 0.18 +
    overlapScore(effectiveTerms, categoryTokens) * 0.14 +
    overlapScore(effectiveTerms, tags) * 0.1 +
    availability * 0.1 +
    rating * 0.06 +
    (onSale ? 0.05 : 0);

  if (normalizeText(query) && semanticText.includes(normalizeText(query))) {
    score += 0.18;
  }
  if (intent === 'promotion_search') {
    score = (onSale ? 0.45 : 0) + discount / 100 * 0.35 + rating * 0.1 + availability * 0.1;
  }
  if (intent === 'inventory_check' && effectiveTerms.length <= 1) {
    score += availability * 0.35 + rating * 0.1;
  }
  if (intent === 'cart_optimization' && cartTerms.length > 0) {
    score += overlapScore(cartTerms, semanticTokens) * 0.22;
    if (onSale) score += 0.08;
  }
  if (overBudget) {
    score -= 0.25;
  }

  if (FOOD_INTENTS.has(intent) && effectiveTerms.length > 0 && overlapScore(effectiveTerms, semanticTokens) < 0.08 && score < 0.35) {
    return null;
  }

  const finalScore = Math.max(0, Math.min(1, score));
  if (finalScore < (intent === 'promotion_search' || intent === 'inventory_check' ? 0.22 : 0.28)) {
    return null;
  }

  const reasons = [
    overlapScore(effectiveTerms, semanticTokens) > 0 ? 'matches semantic catalog fields' : '',
    overlapScore(effectiveTerms, categoryTokens) > 0 ? 'fits the relevant category' : '',
    availability > 0 ? 'available for the selected branch or catalog' : '',
    onSale ? 'has an active discount or sale marker' : '',
  ].filter(Boolean);

  return { product, score: finalScore, reasons };
}

function retrieveCandidates(
  input: GroqCopilotInput,
  nlu: CopilotNlu,
  intent: CopilotV3Intent,
  instructions: CopilotRetrievalInstructions
): ProductCandidate[] {
  return input.catalog
    .map((product) => scoreCandidate(input.query, product, intent, instructions, nlu, input.branch, input.cartItems))
    .filter((candidate): candidate is ProductCandidate => Boolean(candidate))
    .sort((a, b) =>
      b.score - a.score ||
      getProductStockForBranch(b.product, input.branch) - getProductStockForBranch(a.product, input.branch) ||
      Number(b.product.rating || 0) - Number(a.product.rating || 0) ||
      Number(b.product.discount || 0) - Number(a.product.discount || 0)
    )
    .slice(0, MAX_CANDIDATES_FOR_GROQ);
}

function normalizeEvaluations(raw: unknown, candidates: ProductCandidate[]): CopilotEvaluation[] {
  const candidateIds = new Set(candidates.map((candidate) => Number(candidate.product.id)));
  const evaluations = Array.isArray((raw as { evaluations?: unknown[] } | null)?.evaluations)
    ? (raw as { evaluations: unknown[] }).evaluations
    : [];

  const normalized = evaluations
    .map((item) => item as CopilotEvaluation)
    .map((item) => ({
      ...item,
      productId: Number(item.productId),
      relevanceScore: clamp01(item.relevanceScore, 0.5),
      confidenceScore: clamp01(item.confidenceScore, 0.5),
      reasons: Array.isArray(item.reasons) ? item.reasons.map(String).slice(0, 4) : [],
    }))
    .filter((item) => Number.isFinite(item.productId) && candidateIds.has(item.productId));

  if (normalized.length > 0) {
    return normalized.sort((a, b) =>
      (b.relevanceScore || 0) + (b.confidenceScore || 0) - ((a.relevanceScore || 0) + (a.confidenceScore || 0))
    );
  }

  return candidates.map((candidate) => ({
    productId: candidate.product.id,
    relevanceScore: candidate.score,
    confidenceScore: Math.max(0.55, candidate.score),
    reasons: candidate.reasons,
  }));
}

function sanitizeActions(actions: unknown, selectedIds: number[]): AssistantAction[] {
  if (!Array.isArray(actions)) {
    return [];
  }

  const allowedTypes = new Set<AssistantAction['type']>([
    'ADD_TO_CART',
    'REMOVE_FROM_CART',
    'REPLACE_CART_ITEMS',
    'OPEN_PRODUCT',
    'OPEN_CHECKOUT',
    'OPEN_SUPPORT',
    'SET_BRANCH',
    'APPLY_SEARCH',
    'VIEW_ORDER',
  ]);

  const sanitized: AssistantAction[] = actions
    .map((action) => action as AssistantAction)
    .filter((action) => allowedTypes.has(action.type) && typeof action.label === 'string')
    .map((action): AssistantAction => ({
      ...action,
      productIds: action.productIds?.map(Number).filter(Number.isFinite).slice(0, 20),
      replacementProductIds: action.replacementProductIds?.map(Number).filter(Number.isFinite).slice(0, 20),
    }))
    .slice(0, 6);

  if (selectedIds.length) {
    sanitized.push({
      type: 'APPLY_SEARCH',
      label: 'Open recommendations',
      description: 'View these recommendations in the shop.',
      productIds: selectedIds.slice(0, 12),
    });
  }

  return sanitized;
}

function buildShoppingPlanFromReasoning(query: string, reasoning: CopilotReasoning, selectedIds: number[]): ShoppingPlan | undefined {
  const items = (reasoning.shopping_list || []).map(String).filter(Boolean).slice(0, 16);
  if (items.length === 0) {
    return undefined;
  }

  return {
    title: 'AI shopping plan',
    query,
    peopleCount: null,
    items,
    matchedItems: items.map((item) => ({
      item,
      productIds: selectedIds,
      primaryProductId: selectedIds[0] ?? null,
      primaryProductName: null,
    })),
    missingItems: (reasoning.missing_items || []).map(String).slice(0, 12),
    addAllProductIds: unique([...(reasoning.add_all_product_ids || []), ...selectedIds]).slice(0, 12),
    budgetHint: typeof reasoning.budget_estimate === 'number' ? reasoning.budget_estimate : null,
  };
}

function buildFallbackMessage(intent: CopilotV3Intent, query: string, products: Product[], reasoning: CopilotReasoning): string {
  if (reasoning.advisor_summary) {
    return reasoning.advisor_summary;
  }

  if (products.length > 0) {
    const names = products.slice(0, 3).map((product) => product.name).join(', ');
    if (intent === 'recipe' || intent === 'meal_planning') {
      return `I found ingredients that can help with "${query}", including ${names}. I also checked availability, price, category fit, and branch stock before ranking them.`;
    }
    if (intent === 'promotion_search') {
      return `I found active value picks for "${query}", starting with ${names}.`;
    }
    return `I found relevant Simba options for "${query}", starting with ${names}.`;
  }

  return `I do not see an exact match yet, but I can still help narrow this down by category, branch, budget, or a substitute.`;
}

export async function runGroqCopilotV3(input: GroqCopilotInput): Promise<GroqCopilotResult | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  const query = input.query.trim();
  if (!apiKey || !query) {
    return null;
  }

  const catalogProfile = buildCatalogProfile(input.catalog);
  const context = buildContextSnapshot(input);
  const baseRules =
    'You are Simba AI Shopping Copilot V3. Return JSON only. Use natural shopping reasoning. Never recommend products outside relevant categories. Never rank by product name alone. Use name, description, category, brand, tags, inventory, discount, rating, branch stock, cart, page, role, history, and user goal. If exact products are missing, search substitutes and alternatives before asking a clarification.';

  const stage1 = await callGroqJson<CopilotNlu>('nlu', `${baseRules} Stage 1: extract natural language understanding fields.`, {
    raw_user_message: query,
    context,
    required_output: {
      intent: 'string hint',
      entities: {},
      products: ['string'],
      categories: ['string'],
      meals: ['string'],
      budget: 'number or null',
      quantity: 'number or null',
      branch_reference: 'string or null',
      urgency: 'string or null',
      user_goal: 'string',
      shopping_context: 'string',
      constraints: ['string'],
      followup_reference: 'string or null',
      confidence: '0..1',
    },
  }, 700);
  const nlu = { ...fallbackNlu(query, input.context), ...(stage1 || {}) };

  const stage2 = await callGroqJson<CopilotIntentResult>('intent_detection', `${baseRules} Stage 2: classify exactly one intent with confidence. Allowed intents: shopping, recipe, meal_planning, cart_optimization, promotion_search, product_comparison, support, order_tracking, account_help, inventory_check, general_chat.`, {
    raw_user_message: query,
    nlu,
    context,
    required_output: {
      intent: 'one allowed intent',
      confidence: '0..1',
      secondary_intents: ['allowed intent'],
      reason: 'short reason',
    },
  }, 500);
  const fallbackStage2 = fallbackIntent(query, nlu, input.context);
  const intentResult: CopilotIntentResult = {
    ...fallbackStage2,
    ...(stage2 || {}),
    intent: normalizeIntent(stage2?.intent, fallbackStage2.intent),
    confidence: clamp01(stage2?.confidence, fallbackStage2.confidence),
  };

  const stage3 = await callGroqJson<CopilotRetrievalInstructions>('catalog_understanding', `${baseRules} Stage 3: understand the catalog schema and create semantic retrieval instructions. Application performs retrieval, not you. Expand vague needs like milk, tea, lunch, pizza, healthy snacks, and promotions into relevant product/category terms.`, {
    raw_user_message: query,
    nlu,
    intent: intentResult,
    catalog_schema: catalogProfile,
    context,
    required_output: {
      expanded_queries: ['string'],
      product_terms: ['string'],
      category_terms: ['string'],
      brand_terms: ['string'],
      required_categories: ['string'],
      excluded_categories: ['string'],
      meal_ideas: ['string'],
      retrieval_strategy: 'string',
      semantic_filters: ['string'],
    },
  }, 800);
  const retrievalInstructions = {
    ...fallbackRetrievalInstructions(query, nlu, intentResult.intent),
    ...(stage3 || {}),
  };

  const candidates = retrieveCandidates(input, nlu, intentResult.intent, retrievalInstructions);
  const candidateSummaries = candidates.map((candidate) => ({
    ...summarizeProduct(candidate.product, input.branch),
    retrievalScore: Number(candidate.score.toFixed(3)),
    retrievalReasons: candidate.reasons,
  }));

  const stage4 = await callGroqJson<{ evaluations: CopilotEvaluation[] }>('product_evaluation', `${baseRules} Stage 4: evaluate only the provided product candidates. Score relevance, availability, price suitability, meal suitability, cart suitability, branch suitability, and user-goal suitability. Return only candidate IDs.`, {
    raw_user_message: query,
    nlu,
    intent: intentResult,
    context,
    retrieval_instructions: retrievalInstructions,
    candidates: candidateSummaries,
    required_output: {
      evaluations: [{
        productId: 'candidate id',
        relevanceScore: '0..1',
        confidenceScore: '0..1',
        dimensions: {
          relevance: '0..1',
          availability: '0..1',
          priceSuitability: '0..1',
          mealSuitability: '0..1',
          cartSuitability: '0..1',
          branchSuitability: '0..1',
          userGoalSuitability: '0..1',
        },
        reasons: ['short reason'],
      }],
    },
  }, 1600);
  const evaluations = normalizeEvaluations(stage4, candidates);
  const candidateById = new Map(candidates.map((candidate) => [Number(candidate.product.id), candidate.product]));
  const evaluatedProducts = evaluations
    .map((evaluation) => candidateById.get(Number(evaluation.productId)))
    .filter((product): product is Product => Boolean(product))
    .slice(0, MAX_SELECTED_PRODUCTS);

  const stage5 = await callGroqJson<CopilotReasoning>('reasoning', `${baseRules} Stage 5: reason like a human shopping advisor. Recommend, compare, substitute, bundle, optimize, plan meals, estimate costs, and suggest promotions when relevant.`, {
    raw_user_message: query,
    nlu,
    intent: intentResult,
    context,
    selected_products: evaluatedProducts.map((product) => summarizeProduct(product, input.branch)),
    cart: context.cart,
    evaluations: evaluations.slice(0, 16),
    required_output: {
      advisor_summary: 'natural summary',
      meal_ideas: ['string'],
      shopping_list: ['string'],
      budget_estimate: 'number or null',
      savings_estimate: 'number or null',
      comparisons: ['string'],
      substitutions: [{ originalProductId: 'number', replacementProductId: 'number', reason: 'string', savings: 'number' }],
      missing_items: ['string'],
      add_all_product_ids: ['number'],
      suggested_actions: [{ type: 'ADD_TO_CART', label: 'string', description: 'string', productIds: ['number'] }],
      follow_up_question: 'string or null',
      memory_updates: {},
    },
  }, 1200);
  const reasoning: CopilotReasoning = stage5 || {};

  const stage6 = await callGroqJson<CopilotFinalResponse>('response_generation', `${baseRules} Stage 6: write the final conversational response. Do not say "Searching catalog", "No results", or "I could not find a strong Simba match." Be useful, specific, and natural.`, {
    raw_user_message: query,
    nlu,
    intent: intentResult,
    context,
    selected_products: evaluatedProducts.map((product) => summarizeProduct(product, input.branch)),
    evaluations: evaluations.slice(0, 12),
    reasoning,
    required_output: {
      message: 'natural conversational answer',
      product_ids: ['selected product ids'],
      explanation: 'short explanation of reasoning',
      suggestions: ['next user prompts'],
      actions: [{ type: 'ADD_TO_CART', label: 'string', description: 'string', productIds: ['number'] }],
      recipe: 'optional recipe plan object',
      shopping_plan: 'optional shopping plan object',
      support_reply: 'optional support text',
      support_url: 'optional support route',
    },
  }, 1100);

  const stage6Ids = Array.isArray(stage6?.product_ids)
    ? stage6.product_ids.map(Number).filter((id) => Number.isFinite(id) && candidateById.has(id))
    : [];
  const evaluatedIds = evaluatedProducts.map((product) => product.id);
  const productIds = unique([...stage6Ids, ...evaluatedIds]).slice(0, Math.max(1, Math.min(input.limit, MAX_SELECTED_PRODUCTS)));
  const products = productIds.map((id) => candidateById.get(id)).filter((product): product is Product => Boolean(product));
  const addAllIds = unique([...(reasoning.add_all_product_ids || []), ...productIds])
    .map(Number)
    .filter((id) => Number.isFinite(id) && candidateById.has(id))
    .slice(0, 12);
  const generatedActions = sanitizeActions([...(stage6?.actions || []), ...(reasoning.suggested_actions || [])], productIds);

  if ((intentResult.intent === 'recipe' || intentResult.intent === 'meal_planning' || query.toLowerCase().includes('add everything')) && addAllIds.length > 0) {
    generatedActions.unshift({
      type: 'ADD_TO_CART',
      label: intentResult.intent === 'recipe' ? 'Add ingredients' : 'Add shopping list',
      description: 'Add the matched products for this plan to the cart.',
      productIds: addAllIds,
    });
  }

  return {
    intent: intentResult.intent,
    mode: intentResult.intent,
    confidence: Math.max(0.1, Math.min(0.99, (intentResult.confidence + clamp01(nlu.confidence, 0.7)) / 2)),
    message: stage6?.message?.trim() || buildFallbackMessage(intentResult.intent, query, products, reasoning),
    explanation: stage6?.explanation?.trim() || intentResult.reason || 'Groq analyzed the request, expanded the catalog search, evaluated candidate products, then generated a shopping recommendation.',
    suggestions: Array.isArray(stage6?.suggestions)
      ? stage6.suggestions.map(String).filter(Boolean).slice(0, 4)
      : ['Add the recommended items', 'Show cheaper alternatives', 'Check another branch'],
    products,
    productIds,
    actions: generatedActions,
    recipe: stage6?.recipe,
    shoppingPlan: stage6?.shopping_plan || buildShoppingPlanFromReasoning(query, reasoning, addAllIds),
    supportReply: stage6?.support_reply,
    supportUrl: stage6?.support_url,
    nlu,
    retrievalInstructions,
    evaluations,
    reasoning,
  };
}
