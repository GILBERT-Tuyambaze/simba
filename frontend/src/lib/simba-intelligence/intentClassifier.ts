export type AssistantPageType =
  | 'home'
  | 'shop'
  | 'product'
  | 'cart'
  | 'checkout'
  | 'order'
  | 'account'
  | 'admin'
  | 'assistant'
  | 'support'
  | 'login'
  | 'unknown';

export type SimbaIntent =
  | 'product_search'
  | 'recipe_assistant'
  | 'shopping_planner'
  | 'customer_support'
  | 'product_expert'
  | 'cart_builder'
  | 'branch_assistant'
  | 'general_chat'
  | 'support_question'
  | 'order_tracking'
  | 'recommendation_request';

export type SimbaIntentContext = {
  pageType?: AssistantPageType;
  pageTitle?: string;
  productId?: number | null;
  categoryId?: number | string | null;
  branchId?: number | string | null;
  branch?: string | null;
  cartSummary?: string | null;
  currentUserRole?: string | null;
};

const ORDER_TRACKING_TERMS = /\b(order|track(?:ing)?|status|cancel|cancelled|refund|return|exchange)\b/;
const SUPPORT_TERMS = /\b(account|login|password|verify|email|support|help|policy|shipping|checkout|billing|receipt|customer service|branch|location|pickup|hours|open|opening|address|delivery)\b/;
const RECIPE_TERMS = /\b(recipe|cook|cooking|make\s+(?:pizza|chapati|fried rice|breakfast)|ingredients?|what do i need|meal plan|meal ideas?)\b/;
const SHOPPING_PLANNER_TERMS = /\b(family|weekly|groceries|shopping list|plan(?:ning)?|party|birthday|meal prep|for\s+\d+\s+people)\b/;
const CART_TERMS = /\b(cart|basket|cheaper|cheapest|replace|remove|optimize|budget|swap|substitute|alternatives?)\b/;
const BRANCH_TERMS = /\b(branch|available at|in stock at|location|nearest|where.*available|which branch)\b/;
const EXPERT_TERMS = /\b(compare|comparison|difference|better|healthier|best choice|which.*best|why this|recommendation)\b/;
const RECOMMENDATION_TERMS = /\b(recommend|suggest|best (?:products|items)|what should i buy|ideas|bundle|good for|help me choose|suggestions?)\b/;
const GENERAL_CHAT_TERMS = /\b(hi|hello|hey|thanks|thank you|bye|good morning|good afternoon|good evening|how are you|what can you do)\b/;
const PAGE_PROMPT_MAP: Record<AssistantPageType, SimbaIntent> = {
  home: 'product_search',
  shop: 'product_search',
  product: 'product_expert',
  cart: 'cart_builder',
  checkout: 'customer_support',
  order: 'customer_support',
  account: 'customer_support',
  admin: 'customer_support',
  assistant: 'general_chat',
  support: 'customer_support',
  login: 'customer_support',
  unknown: 'product_search',
};

export function classifyIntent(query: string, context?: SimbaIntentContext): SimbaIntent {
  const normalized = query.trim().toLowerCase();
  const pageType = context?.pageType || 'unknown';

  if (!normalized) {
    return PAGE_PROMPT_MAP[pageType] || 'general_chat';
  }

  if (RECIPE_TERMS.test(normalized)) {
    return 'recipe_assistant';
  }

  if (SHOPPING_PLANNER_TERMS.test(normalized)) {
    return 'shopping_planner';
  }

  if (CART_TERMS.test(normalized) || pageType === 'cart') {
    return 'cart_builder';
  }

  if (BRANCH_TERMS.test(normalized)) {
    return 'branch_assistant';
  }

  if (ORDER_TRACKING_TERMS.test(normalized)) {
    return 'order_tracking';
  }

  if (/(refund|return|exchange)/.test(normalized)) {
    return 'customer_support';
  }

  if (SUPPORT_TERMS.test(normalized) || pageType === 'checkout' || pageType === 'order' || pageType === 'account' || pageType === 'support' || pageType === 'login') {
    return 'customer_support';
  }

  if (EXPERT_TERMS.test(normalized) || pageType === 'product') {
    return 'product_expert';
  }

  if (RECOMMENDATION_TERMS.test(normalized)) {
    return 'recommendation_request';
  }

  if (GENERAL_CHAT_TERMS.test(normalized)) {
    return 'general_chat';
  }

  return PAGE_PROMPT_MAP[pageType] || 'product_search';
}

export function isSupportIntent(query: string, context?: SimbaIntentContext): boolean {
  const intent = classifyIntent(query, context);
  return intent === 'customer_support' || intent === 'support_question' || intent === 'order_tracking';
}

export function isOrderTrackingIntent(query: string, context?: SimbaIntentContext): boolean {
  const intent = classifyIntent(query, context);
  return intent === 'order_tracking';
}

export function isRecommendationIntent(query: string, context?: SimbaIntentContext): boolean {
  const intent = classifyIntent(query, context);
  return intent === 'recommendation_request' || intent === 'product_expert' || intent === 'shopping_planner' || intent === 'recipe_assistant';
}

export function getSupportResponse(query: string, branch?: string, context?: SimbaIntentContext): { supportReply: string; supportUrl: string } {
  const normalized = query.trim().toLowerCase();
  const pageType = context?.pageType;

  if (/(order|track(?:ing)?|status|cancel|cancelled)/.test(normalized) || pageType === 'order') {
    return {
      supportReply:
        'I can help with order tracking, cancellations, and status updates. Check your Account orders page or visit the Support page for the latest delivery information.',
      supportUrl: '/account?tab=orders',
    };
  }

  if (/(refund|return|exchange)/.test(normalized)) {
    return {
      supportReply:
        'For returns, refunds, and exchanges, see our Support page. You can also review your recent orders in Account to start a return request.',
      supportUrl: '/support',
    };
  }

  if (/(branch|pickup|location|hours|open|opening|address)/.test(normalized)) {
    return {
      supportReply:
        branch
          ? `You are shopping from ${branch}. I can help find items available there, and the Support page has branch hours, pickup details, and location information.`
          : 'I can help with branch availability, opening hours, and pickup details. Visit the Support page for branch locations and hours.',
      supportUrl: '/support',
    };
  }

  if (/(account|login|password|verify|email)/.test(normalized) || pageType === 'login') {
    return {
      supportReply:
        'Account and login help is available on the login page and in the Support section. If you need to reset your password or verify your email, use the auth pages.',
      supportUrl: '/support',
    };
  }

  return {
    supportReply:
      'For shopping, delivery, returns, and account questions, our Support page is the best place to get the latest help and policies.',
    supportUrl: '/support',
  };
}
