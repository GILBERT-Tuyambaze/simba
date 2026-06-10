export type SimbaIntent =
  | 'product_search'
  | 'support_question'
  | 'order_tracking'
  | 'recommendation_request'
  | 'general_chat';

const ORDER_TRACKING_TERMS = /\b(order|track(?:ing)?|status|cancel|cancelled|refund|return|exchange)\b/;
const SUPPORT_TERMS = /\b(account|login|password|verify|email|support|help|policy|shipping|checkout|billing|receipt|customer service|branch|location|pickup|hours|open|opening|address)\b/;
const RECOMMENDATION_TERMS = /\b(recommend|suggest|best (?:products|items)|what should i buy|ideas|meal ideas|bundle|good for|help me choose|suggestions?)\b/;
const GENERAL_CHAT_TERMS = /\b(hi|hello|hey|thanks|thank you|bye|good morning|good afternoon|good evening|how are you)\b/;

export function classifyIntent(query: string): SimbaIntent {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return 'general_chat';
  }

  if (ORDER_TRACKING_TERMS.test(normalized)) {
    return 'order_tracking';
  }

  if (SUPPORT_TERMS.test(normalized)) {
    return 'support_question';
  }

  if (RECOMMENDATION_TERMS.test(normalized)) {
    return 'recommendation_request';
  }

  if (GENERAL_CHAT_TERMS.test(normalized)) {
    return 'general_chat';
  }

  return 'product_search';
}

export function isSupportIntent(query: string): boolean {
  return classifyIntent(query) === 'support_question';
}

export function isOrderTrackingIntent(query: string): boolean {
  return classifyIntent(query) === 'order_tracking';
}

export function isRecommendationIntent(query: string): boolean {
  return classifyIntent(query) === 'recommendation_request';
}

export function getSupportResponse(query: string, branch?: string): { supportReply: string; supportUrl: string } {
  const normalized = query.trim().toLowerCase();

  if (/(order|track(?:ing)?|status|cancel|cancelled)/.test(normalized)) {
    return {
      supportReply:
        'I can help with order tracking, cancellations, and status updates. Check your Account orders page or visit the Support page for the latest delivery information.',
      supportUrl: '/support',
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

  if (/(account|login|password|verify|email)/.test(normalized)) {
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
