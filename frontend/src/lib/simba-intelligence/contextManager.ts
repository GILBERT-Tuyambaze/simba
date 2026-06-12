import type { Product } from '@/lib/types';
import type { AssistantPageType, SimbaIntent } from './intentClassifier';

export type SimbaUserContext = {
  id: string;
  email?: string;
  name?: string;
  role?: string;
  default_branch?: string | null;
};

export type SimbaAssistantMemory = {
  currentGoal?: string;
  currentMode?: SimbaIntent;
  currentRecipe?: string;
  currentShoppingList?: string[];
  currentCart?: number[];
  currentBranch?: string;
  currentPageType?: AssistantPageType;
};

export type SimbaConversationMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  query?: string;
  products?: Product[];
};

export type SimbaContext = {
  branch?: string;
  pageType?: AssistantPageType;
  pageTitle?: string;
  productId?: number | null;
  categoryId?: number | string | null;
  branchId?: number | string | null;
  cartSummary?: string | null;
  user?: SimbaUserContext;
  memory: SimbaAssistantMemory;
  history: SimbaConversationMessage[];
};

const MAX_HISTORY = 20;

export function createSimbaContext(params: Partial<SimbaContext> = {}): SimbaContext {
  return {
    branch: params.branch,
    pageType: params.pageType,
    pageTitle: params.pageTitle,
    productId: params.productId,
    categoryId: params.categoryId,
    branchId: params.branchId,
    cartSummary: params.cartSummary,
    user: params.user,
    memory: params.memory || {},
    history: params.history ? params.history.slice(-MAX_HISTORY) : [],
  };
}

export function appendSimbaMessage(
  context: SimbaContext,
  message: SimbaConversationMessage
): SimbaContext {
  return {
    ...context,
    history: [...context.history, message].slice(-MAX_HISTORY),
  };
}

export function clearSimbaHistory(context: SimbaContext): SimbaContext {
  return {
    ...context,
    history: [],
  };
}

export function getUserRole(context: SimbaContext): string | undefined {
  return context.user?.role;
}

export function getBranchFromContext(context: SimbaContext): string | undefined {
  return context.branch;
}

export function updateSimbaMemory(
  context: SimbaContext,
  nextMemory: Partial<SimbaAssistantMemory>
): SimbaContext {
  return {
    ...context,
    memory: {
      ...context.memory,
      ...nextMemory,
    },
  };
}

export function inferPageType(pathname: string): AssistantPageType {
  const normalized = pathname.toLowerCase();
  if (normalized === '/' || normalized === '') return 'home';
  if (normalized.startsWith('/shop')) return 'shop';
  if (normalized.startsWith('/product/')) return 'product';
  if (normalized.startsWith('/cart')) return 'cart';
  if (normalized.startsWith('/checkout')) return 'checkout';
  if (normalized.startsWith('/account')) return 'order';
  if (normalized.startsWith('/admin')) return 'admin';
  if (normalized.startsWith('/assistant')) return 'assistant';
  if (normalized.startsWith('/support')) return 'support';
  if (normalized.startsWith('/login')) return 'login';
  return 'unknown';
}
