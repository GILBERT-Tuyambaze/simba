import { composeSimbaResponse, type SimbaResponse } from './responseComposer';
import {
  appendSimbaMessage,
  clearSimbaHistory,
  createSimbaContext,
  getBranchFromContext,
  getUserRole,
  inferPageType,
  updateSimbaMemory,
  type SimbaAssistantMemory,
  type SimbaContext,
  type SimbaConversationMessage,
  type SimbaUserContext,
} from './contextManager';
import {
  buildSearchPlan,
  buildLocalConversationalMatches,
  buildLocalConversationalResult,
  buildProductSemanticText,
  isProductRelevantToQuery,
  type AssistantAction,
  type ProductQueryOptions,
  type RankingStrategy,
  type RecipePlan,
  type ShoppingPlan,
  type SimbaAssistantContext,
  type SimbaSearchPlan,
} from './queryPlanner';
import { classifyIntent, getSupportResponse, type AssistantPageType, type SimbaIntent, type SimbaIntentContext } from './intentClassifier';
import type { Product } from '@/lib/types';
import {
  generateProductSemanticText,
  extractProductKeywords,
  buildIndexedCatalog,
  scoreProductWithExplanation,
  scoreProduct,
  scoredProductsWithExplanation,
  getRecommendations,
  isRelevantToQuery,
  explainRecommendation,
  filterRelevantProducts,
  type RelevanceExplanation,
  type CatalogEntry,
  type ScoredProduct,
  MIN_RELEVANCE,
} from './catalog';
import {
  findCheaperAlternatives,
  findHealthierAlternatives,
  optimizeCartForPrice,
  optimizeCartForHealth,
  suggestMissingItems,
  buildCartFromIngredients,
  type CartActionType,
  type CartAction,
  type CartOptimization,
} from './cartBuilder';
import {
  identifyRecipe,
  getAllRecipes,
  searchRecipes,
  matchIngredientsToProducts,
  findMissingIngredients,
  matchRecipeToProducts,
  buildCartFromRecipe,
  suggestAlternativeRecipes,
  calculateRecipeCostByBranch,
  adjustRecipeForServings,
  getRecipeLibrary,
  type Recipe,
  type RecipeMatch,
  type RecipeShoppingList,
} from './recipeEngine';
import {
  getRoleCapabilities,
  canUserPerformAction,
  validateUserPermission,
  getProductAvailability,
  filterByBranchAvailability,
  sortByBranchAvailability,
  suggestAlternativeBranches,
  getBranchAvailabilityNotification,
  prioritizeSelectedBranch,
  filterRecommendationsByRole,
  buildRoleAwareContext,
  getRoleSpecificBehavior,
  type UserRole,
  type BranchInfo,
  type ProductAvailability,
  type RoleCapabilities,
} from './branchRoleAwareness';
import {
  runAllValidations,
  type ValidationReport,
} from './validation';

const DEFAULT_LIMIT = 8;

export {
  classifyIntent,
  getSupportResponse,
  type SimbaIntent,
  type AssistantPageType,
  type SimbaIntentContext,
  buildSearchPlan,
  buildLocalConversationalMatches,
  buildLocalConversationalResult,
  buildProductSemanticText,
  isProductRelevantToQuery,
  type ProductQueryOptions,
  type RankingStrategy,
  type AssistantAction,
  type RecipePlan,
  type ShoppingPlan,
  type SimbaAssistantContext,
  type SimbaSearchPlan,
  composeSimbaResponse,
  createSimbaContext,
  appendSimbaMessage,
  clearSimbaHistory,
  getUserRole,
  getBranchFromContext,
  inferPageType,
  updateSimbaMemory,
  type SimbaAssistantMemory,
  type SimbaContext,
  type SimbaConversationMessage,
  type SimbaUserContext,
  type SimbaResponse,
  // Catalog Intelligence Phase 1
  generateProductSemanticText,
  extractProductKeywords,
  buildIndexedCatalog,
  scoreProductWithExplanation,
  scoreProduct,
  scoredProductsWithExplanation,
  getRecommendations,
  isRelevantToQuery,
  explainRecommendation,
  filterRelevantProducts,
  type RelevanceExplanation,
  type CatalogEntry,
  type ScoredProduct,
  MIN_RELEVANCE,
  // Cart Builder Phase 5
  findCheaperAlternatives,
  findHealthierAlternatives,
  optimizeCartForPrice,
  optimizeCartForHealth,
  suggestMissingItems,
  buildCartFromIngredients,
  type CartActionType,
  type CartAction,
  type CartOptimization,
  // Recipe Engine Phase 4
  identifyRecipe,
  getAllRecipes,
  searchRecipes,
  matchIngredientsToProducts,
  findMissingIngredients,
  matchRecipeToProducts,
  buildCartFromRecipe,
  suggestAlternativeRecipes,
  calculateRecipeCostByBranch,
  adjustRecipeForServings,
  getRecipeLibrary,
  type Recipe,
  type RecipeMatch,
  type RecipeShoppingList,
  // Branch & Role Awareness Phase 6 & 8
  getRoleCapabilities,
  canUserPerformAction,
  validateUserPermission,
  getProductAvailability,
  filterByBranchAvailability,
  sortByBranchAvailability,
  suggestAlternativeBranches,
  getBranchAvailabilityNotification,
  prioritizeSelectedBranch,
  filterRecommendationsByRole,
  buildRoleAwareContext,
  getRoleSpecificBehavior,
  type UserRole,
  type BranchInfo,
  type ProductAvailability,
  type RoleCapabilities,
  // Validation Phase 12
  runAllValidations,
  type ValidationReport,
};

export async function runSimbaSearch(
  query: string,
  products: Product[],
  limit: number = DEFAULT_LIMIT,
  branch?: string,
  context?: SimbaAssistantContext
): Promise<SimbaResponse> {
  const plan = buildSearchPlan(query, branch, undefined, context);
  const localMatches = buildLocalConversationalMatches(query, products, limit, branch, context);
  const localResponse = composeSimbaResponse(plan, localMatches, 'local');

  if (!query.trim() || products.length === 0) {
    return localResponse;
  }

  const requestId = `${query.trim().toLowerCase()}:${limit}`;
  const richContext = context as SimbaAssistantContext & {
    memory?: Record<string, unknown>;
    user?: Record<string, unknown>;
  };

  try {
    const response = await fetch('/api/catalog-assistant/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit,
        request_id: requestId,
        branch,
        page_type: context?.pageType,
        page_title: context?.pageTitle,
        product_id: context?.productId,
        category_id: context?.categoryId,
        branch_id: context?.branchId,
        cart_summary: context?.cartSummary,
        current_user_role: context?.currentUserRole,
        cart_items: context?.cartItems || [],
        history: context?.history || [],
        memory: richContext?.memory || {},
        user: richContext?.user || {},
        last_viewed_products: context?.productId ? [context.productId] : [],
        recent_searches: (context?.history || [])
          .filter((message) => message.role === 'user')
          .map((message) => message.text)
          .slice(-8),
      }),
    });

    if (!response.ok) {
      throw new Error(`Catalog assistant request failed (${response.status})`);
    }

    const data = await response.json();
    const rawProductIds = Array.isArray(data?.product_ids) ? data.product_ids : [];
    const productMap = new Map(products.map((product) => [product.id, product]));
    const matchedProducts = rawProductIds
      .map((id: unknown) => {
        const numericId = typeof id === 'number' ? id : Number(id);
        return Number.isFinite(numericId) ? productMap.get(numericId) || null : null;
      })
      .filter((product: Product | null): product is Product => Boolean(product));

    const finalProducts = matchedProducts.length > 0 ? matchedProducts : localMatches;
    const overrideMessage =
      typeof data?.message === 'string' && data.message.trim()
        ? data.message.trim()
        : undefined;
    const composed = composeSimbaResponse(
      plan,
      finalProducts,
      matchedProducts.length > 0 ? 'groq' : 'local',
      overrideMessage,
      {
        supportReply: typeof data?.support_reply === 'string' ? data.support_reply : localResponse.supportReply,
        supportUrl: typeof data?.support_url === 'string' ? data.support_url : localResponse.supportUrl,
      }
    );

    const serverActions = Array.isArray(data?.actions)
      ? data.actions.filter((action: unknown): action is AssistantAction => {
          const candidate = action as Partial<AssistantAction>;
          return typeof candidate?.type === 'string' && typeof candidate?.label === 'string';
        })
      : [];

    return {
      ...composed,
      intent: (typeof data?.intent === 'string' ? data.intent : composed.intent) as SimbaResponse['intent'],
      mode: (typeof data?.mode === 'string' ? data.mode : typeof data?.intent === 'string' ? data.intent : composed.mode) as SimbaResponse['mode'],
      source: data?.source === 'groq-v3' || matchedProducts.length > 0 ? 'groq' : composed.source,
      confidence: typeof data?.confidence === 'number' ? data.confidence : composed.confidence,
      explanation: typeof data?.explanation === 'string' ? data.explanation : composed.explanation,
      suggestions: Array.isArray(data?.suggestions) ? data.suggestions.map(String).slice(0, 5) : composed.suggestions,
      actions: [...serverActions, ...composed.actions],
      recipe: data?.recipe || composed.recipe,
      shoppingPlan: data?.shopping_plan || composed.shoppingPlan,
      supportReply: typeof data?.support_reply === 'string' ? data.support_reply : composed.supportReply,
      supportUrl: typeof data?.support_url === 'string' ? data.support_url : composed.supportUrl,
    };
  } catch {
    return localResponse;
  }
}
