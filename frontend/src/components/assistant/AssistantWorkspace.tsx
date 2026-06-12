import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  ChevronRight,
  MessageCircle,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useProducts } from '@/hooks/useProducts';
import {
  appendSimbaMessage,
  buildLocalConversationalResult,
  buildSearchPlan,
  composeSimbaResponse,
  createSimbaContext,
  inferPageType,
  runSimbaSearch,
  updateSimbaMemory,
  type AssistantAction,
  type SimbaAssistantContext,
  type SimbaContext,
} from '@/lib/simba-intelligence';
import { buildShopSearchUrl } from '@/lib/conversational-search';
import { formatRWF, getBranchDetails, type Product } from '@/lib/types';
import { useI18n } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

type AssistantWorkspaceProps = {
  variant: 'floating' | 'page';
  pageTitle?: string;
};

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  products?: Product[];
  query?: string;
  mode?: string;
  confidence?: number;
  explanation?: string;
  suggestions?: string[];
  actions?: AssistantAction[];
  supportReply?: string;
  supportUrl?: string;
  recipe?: ReturnType<typeof buildLocalConversationalResult>['recipe'];
  shoppingPlan?: ReturnType<typeof buildLocalConversationalResult>['shoppingPlan'];
};

const BRAND_TITLE = process.env.NEXT_PUBLIC_APP_TITLE?.trim() || 'Simba Supermarket';
const BRAND_LOGO_URL = process.env.NEXT_PUBLIC_APP_LOGO_URL?.trim() || '/android-chrome-192x192.png';
const GREETING_STORAGE_KEY = 'simba_store_assistant_greeted_v2';
const DEFAULT_PAGE_TITLE = 'Simba Assistant';

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getDisplayName(name: string | null | undefined, email: string | null | undefined): string {
  if (name?.trim()) {
    return name.trim().split(/\s+/)[0];
  }
  if (email?.trim()) {
    return email.trim().split('@')[0];
  }
  return '';
}

function getProductPrice(product: Product): number {
  return Math.max(
    0,
    Number(product.discount || 0) > 0
      ? Number(product.price || 0) * (1 - Number(product.discount || 0) / 100)
      : Number(product.price || 0)
  );
}

function getPageTitle(pathname: string, explicitTitle?: string): string {
  if (explicitTitle?.trim()) {
    return explicitTitle.trim();
  }

  const branch = inferPageType(pathname);
  switch (branch) {
    case 'home':
      return 'Home';
    case 'shop':
      return 'Shop';
    case 'product':
      return 'Product';
    case 'cart':
      return 'Cart';
    case 'checkout':
      return 'Checkout';
    case 'order':
      return 'Orders';
    case 'account':
      return 'Account';
    case 'admin':
      return 'Admin';
    case 'support':
      return 'Support';
    case 'login':
      return 'Login';
    case 'assistant':
      return 'Assistant';
    default:
      return DEFAULT_PAGE_TITLE;
  }
}

function getModeLabel(mode?: string): string {
  switch (mode) {
    case 'shopping':
      return 'Shopping';
    case 'recipe':
    case 'recipe_assistant':
      return 'Recipe';
    case 'meal_planning':
    case 'shopping_planner':
      return 'Meal plan';
    case 'promotion_search':
      return 'Deals';
    case 'product_comparison':
      return 'Compare';
    case 'cart_optimization':
      return 'Cart';
    case 'inventory_check':
      return 'Branch stock';
    case 'support':
    case 'customer_support':
    case 'support_question':
      return 'Support';
    case 'order_tracking':
      return 'Orders';
    case 'account_help':
      return 'Account';
    case 'product_expert':
      return 'Expert';
    case 'cart_builder':
      return 'Cart';
    case 'branch_assistant':
      return 'Branch';
    case 'general_chat':
      return 'General';
    case 'recommendation_request':
      return 'Recommendations';
    default:
      return 'Search';
  }
}

function getModeTone(mode?: string): string {
  switch (mode) {
    case 'recipe':
    case 'recipe_assistant':
      return 'border-orange-400/30 bg-orange-500/10 text-orange-100';
    case 'meal_planning':
    case 'shopping_planner':
      return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
    case 'support':
    case 'customer_support':
    case 'support_question':
      return 'border-primary/30 bg-primary/10 text-primary';
    case 'order_tracking':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
    case 'product_comparison':
    case 'product_expert':
      return 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100';
    case 'cart_optimization':
    case 'cart_builder':
      return 'border-green-400/30 bg-green-500/10 text-green-100';
    case 'inventory_check':
    case 'branch_assistant':
      return 'border-sky-400/30 bg-sky-500/10 text-sky-100';
    case 'promotion_search':
      return 'border-accent/40 bg-accent/10 text-accent';
    case 'general_chat':
      return 'border-border bg-secondary/40 text-muted-foreground';
    default:
      return 'border-primary/30 bg-primary/10 text-primary';
  }
}

function getDefaultPrompts(pageType: string, mode?: string): string[] {
  if (mode === 'recipe' || mode === 'recipe_assistant') {
    return ['Help me make pizza', 'What do I need for fried rice?', 'Build a breakfast list'];
  }
  if (mode === 'meal_planning' || mode === 'shopping_planner') {
    return ['Prepare a family breakfast', 'Weekly groceries for 5 people', 'Build a shopping list'];
  }
  if (mode === 'cart_optimization' || mode === 'cart_builder') {
    return ['Make my cart cheaper', 'Remove expensive items', 'Find cheaper alternatives'];
  }
  if (mode === 'product_comparison' || mode === 'product_expert') {
    return ['Compare these products', 'Which one is healthier?', 'Recommend the best value'];
  }
  if (mode === 'inventory_check' || mode === 'branch_assistant') {
    return ['What is available in this branch?', 'Which branch has this item?', 'Show branch alternatives'];
  }
  if (mode === 'promotion_search') {
    return ['Show me promotions', 'Best deals under 20,000 RWF', 'Discounted breakfast items'];
  }
  if (mode === 'support' || mode === 'account_help' || mode === 'customer_support' || mode === 'support_question' || pageType === 'checkout' || pageType === 'order') {
    return ['Where is my order?', 'What payment methods do you accept?', 'How do returns work?'];
  }
  return ['Find milk', 'Show me promotions', 'Help me build a cart'];
}

function formatDateLabel(value?: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString();
}

export default function AssistantWorkspace({ variant, pageTitle }: AssistantWorkspaceProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items: cartItems, branch, addItem, removeItem, clear, setBranch } = useCart();
  const { products, loading: productsLoading } = useProducts();
  const { t } = useI18n();
  const isPage = variant === 'page';
  const pageType = inferPageType(location.pathname);
  const resolvedPageTitle = getPageTitle(location.pathname, pageTitle);
  const hidden = !isPage && (location.pathname.startsWith('/admin') || location.pathname === '/assistant');
  const cartSummary = `${cartItems.length} items, ${formatRWF(cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0))}`;
  const [simbaContext, setSimbaContext] = useState<SimbaContext>(() =>
    createSimbaContext({
      branch,
      pageType,
      pageTitle: resolvedPageTitle,
      cartSummary,
      user: user
        ? {
            id: user.id,
            email: user.email || undefined,
            name: user.name || undefined,
            role: user.role,
            default_branch: user.default_branch || null,
          }
        : undefined,
      memory: {
        currentBranch: branch,
        currentPageType: pageType,
      },
    })
  );
  const [isOpen, setIsOpen] = useState(isPage);
  const [showGreeting, setShowGreeting] = useState(false);
  const [draft, setDraft] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  // Lock scroll while drawer is open and close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen]);

  const displayName = getDisplayName(user?.name, user?.email);
  const currentMode = messages.slice().reverse().find((message) => message.role === 'assistant')?.mode;
  const latestAssistant = messages.slice().reverse().find((message) => message.role === 'assistant');
  const quickPrompts = useMemo(
    () => getDefaultPrompts(pageType, currentMode),
    [currentMode, pageType]
  );
  const assistantContext = useMemo<SimbaAssistantContext>(
    () => ({
      ...simbaContext,
      cartItems,
    }),
    [cartItems, simbaContext]
  );

  const welcomeText = useMemo(() => {
    const branchText = branch ? ` on ${branch}` : '';
    const nameText = displayName ? `${displayName}, ` : '';
    if (pageType === 'checkout') {
      return `${nameText}I can help with payment, delivery, and order support${branchText}.`;
    }
    if (pageType === 'cart') {
      return `${nameText}I can help optimize your cart, suggest alternatives, and build a cheaper basket${branchText}.`;
    }
    if (pageType === 'product') {
      return `${nameText}I can compare products, explain differences, and suggest complements${branchText}.`;
    }
    return displayName
      ? `${t('assistant.welcomeBack', 'Hi')} ${displayName}. I can search products, plan meals, build carts, and answer support questions${branchText}.`
      : `Hi. I can search products, plan meals, build carts, and answer support questions${branchText}.`;
  }, [branch, displayName, pageType, t]);

  useEffect(() => {
    setSimbaContext((current) =>
      createSimbaContext({
        ...current,
        branch,
        pageType,
        pageTitle: resolvedPageTitle,
        cartSummary,
        user: user
          ? {
              id: user.id,
              email: user.email || undefined,
              name: user.name || undefined,
              role: user.role,
              default_branch: user.default_branch || null,
            }
          : undefined,
        memory: {
          ...current.memory,
          currentBranch: branch,
          currentPageType: pageType,
        },
      })
    );
  }, [branch, cartSummary, pageType, resolvedPageTitle, user]);

  useEffect(() => {
    setMessages((current) => {
      if (current.length === 0) {
        return [
          {
            id: createId('assistant'),
            role: 'assistant',
            text: welcomeText,
          },
        ];
      }

      if (!current.some((message) => message.role === 'user') && current.length === 1) {
        return [
          {
            ...current[0],
            text: welcomeText,
          },
        ];
      }

      return current;
    });
  }, [welcomeText]);

  useEffect(() => {
    if (!isPage) {
      if (hidden) {
        setIsOpen(false);
        setShowGreeting(false);
      }
      return;
    }
    setIsOpen(true);
  }, [hidden, isPage]);

  useEffect(() => {
    if (!isPage && !isOpen) {
      return;
    }
    textareaRef.current?.focus();
  }, [isOpen, isPage]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isReplying, isOpen]);

  useEffect(() => {
    if (isPage) {
      return;
    }

    try {
      if (sessionStorage.getItem(GREETING_STORAGE_KEY) === '1') {
        return;
      }
      sessionStorage.setItem(GREETING_STORAGE_KEY, '1');
    } catch {
      // Ignore storage failures.
    }

    const showTimer = window.setTimeout(() => {
      setShowGreeting(true);
    }, 1100);
    const hideTimer = window.setTimeout(() => {
      setShowGreeting(false);
    }, 9000);

    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [isPage]);

  const applyAction = (action: AssistantAction, sourceMessage?: ChatMessage) => {
    if (action.type === 'SET_BRANCH' && action.branch) {
      setBranch(action.branch);
      return;
    }

    if (action.type === 'OPEN_SUPPORT' && action.route) {
      navigate(action.route);
      return;
    }

    if (action.type === 'VIEW_ORDER' && action.route) {
      navigate(action.route);
      return;
    }

    if (action.type === 'OPEN_CHECKOUT') {
      navigate(action.route || '/checkout');
      return;
    }

    if (action.type === 'OPEN_PRODUCT' && action.productIds?.[0]) {
      navigate(`/product/${action.productIds[0]}`);
      return;
    }

    if (action.type === 'APPLY_SEARCH') {
      const resolvedProducts = (action.productIds || [])
        .map((productId) => products.find((product) => product.id === productId))
        .filter((product): product is Product => Boolean(product));
      navigate(action.query ? buildShopSearchUrl(action.query, resolvedProducts) : '/shop');
      return;
    }

    if (action.type === 'ADD_TO_CART' && action.productIds?.length) {
      action.productIds.forEach((productId) => {
        const product = products.find((item) => item.id === productId);
        if (!product) {
          return;
        }

        addItem({
          product_id: product.id,
          product_name: product.name,
          price: getProductPrice(product),
          image: product.image,
          branch,
          unit: product.unit || undefined,
          max_quantity: product.branch_stock && typeof product.branch_stock === 'object'
            ? Number(product.branch_stock[branch] || 0) || undefined
            : product.stock_count || undefined,
        }, 1);
      });
      return;
    }

    if (action.type === 'REMOVE_FROM_CART' && action.productIds?.length) {
      action.productIds.forEach((productId) => removeItem(productId));
      return;
    }

    if (action.type === 'REPLACE_CART_ITEMS' && action.productIds?.length && action.replacementProductIds?.length) {
      action.productIds.forEach((productId) => removeItem(productId));
      action.replacementProductIds.forEach((productId) => {
        const product = products.find((item) => item.id === productId);
        if (!product) {
          return;
        }
        addItem({
          product_id: product.id,
          product_name: product.name,
          price: getProductPrice(product),
          image: product.image,
          branch,
          unit: product.unit || undefined,
          max_quantity: product.branch_stock && typeof product.branch_stock === 'object'
            ? Number(product.branch_stock[branch] || 0) || undefined
            : product.stock_count || undefined,
        }, 1);
      });
    }
  };

  const sendMessage = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query || isReplying) {
      return;
    }

    const userMessage: ChatMessage = {
      id: createId('user'),
      role: 'user',
      text: query,
    };

    setDraft('');
    setIsOpen(true);
    setShowGreeting(false);
    setMessages((current) => [...current, userMessage]);
    setSimbaContext((current) => appendSimbaMessage(current, userMessage));

    if (productsLoading || products.length === 0) {
      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          text: t('assistant.catalogLoading', 'The catalog is still syncing. Try again in a moment.'),
        },
      ]);
      return;
    }

    setIsReplying(true);
    const assistantMessageId = createId('assistant');
    const plan = buildSearchPlan(query, branch, undefined, assistantContext, products);
    const localResponseData = buildLocalConversationalResult(query, products, 6, branch, assistantContext);
    const localResponse = composeSimbaResponse(plan, localResponseData.products, 'local');

    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: 'assistant',
      text: localResponse.message || t('assistant.defaultReply', 'Here are the closest Simba matches I found.'),
      products: localResponse.products.slice(0, 6),
      query,
      mode: localResponse.mode,
      confidence: localResponse.confidence,
      explanation: localResponse.explanation,
      suggestions: localResponse.suggestions,
      actions: localResponse.actions,
      supportReply: localResponse.supportReply,
      supportUrl: localResponse.supportUrl,
      recipe: localResponse.recipe,
      shoppingPlan: localResponse.shoppingPlan,
    };

    setMessages((current) => [...current, assistantMessage]);
    setSimbaContext((current) =>
      updateSimbaMemory(
        appendSimbaMessage(current, assistantMessage),
        {
          currentGoal: localResponse.recipe?.title || localResponse.shoppingPlan?.title || query,
          currentMode: localResponse.mode,
          currentRecipe: localResponse.recipe?.title,
          currentShoppingList: localResponse.shoppingPlan?.items,
          currentCart: cartItems.map((item) => item.product_id),
          currentBranch: branch,
          currentPageType: pageType,
        }
      )
    );

    try {
      const result = await runSimbaSearch(query, products, 6, branch, assistantContext);
      const resultProducts = result.products.slice(0, 6);
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantMessageId
            ? {
                ...message,
                text: result.message || message.text,
                products: resultProducts.length > 0 ? resultProducts : message.products,
                mode: result.mode,
                confidence: result.confidence,
                explanation: result.explanation,
                suggestions: result.suggestions,
                actions: result.actions,
                supportReply: result.supportReply,
                supportUrl: result.supportUrl,
                recipe: result.recipe || message.recipe,
                shoppingPlan: result.shoppingPlan || message.shoppingPlan,
              }
            : message
        )
      );
      setSimbaContext((current) =>
        updateSimbaMemory(current, {
          currentGoal: result.recipe?.title || result.shoppingPlan?.title || query,
          currentMode: result.mode,
          currentRecipe: result.recipe?.title,
          currentShoppingList: result.shoppingPlan?.items,
          currentCart: cartItems.map((item) => item.product_id),
          currentBranch: branch,
          currentPageType: pageType,
        })
      );
    } catch {
      // Keep the local response.
    }

    setIsReplying(false);
  };

  const handleSubmit = async () => {
    await sendMessage(draft);
  };

  const handleKeyDown = async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await handleSubmit();
    }
  };

  const latestProducts = latestAssistant?.products || [];
  const latestActions = latestAssistant?.actions || [];
  const latestRecipe = latestAssistant?.recipe;
  const latestShoppingPlan = latestAssistant?.shoppingPlan;
  const confidence = latestAssistant?.confidence || 0;

  const conversationPanel = (
    <section className={isPage ? 'industrial-border bg-card overflow-hidden' : 'industrial-border overflow-hidden bg-card/98 shadow-[0_0_34px_hsl(var(--primary)/0.16)] backdrop-blur-md'}>
      {!isPage && (
        <div className="border-b border-border bg-secondary/78 px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-black/70">
                <img src={BRAND_LOGO_URL} alt={BRAND_TITLE} className="h-7 w-7 object-contain" />
              </div>
              <div>
                <div className="font-display text-2xl leading-none text-primary crt-glow">
                  {t('assistant.title', 'Simba Assist')}
                </div>
                <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
                  {t('assistant.subtitle', 'Chat for products and ideas')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link to="/assistant" className="terminal-btn text-[10px]">
                Full assistant
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 rounded-full border border-border bg-background/40"
                onClick={() => setIsOpen(false)}
                aria-label={t('assistant.close', 'Close assistant')}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {isPage && (
        <div className="border-b border-border bg-secondary/70 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">{resolvedPageTitle}</div>
              <h1 className="mt-1 text-2xl font-display text-primary crt-glow">
                {t('assistant.title', 'Simba Assist')}
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                One assistant for products, recipes, branch stock, orders, cart actions, and support.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`tag uppercase ${getModeTone(currentMode)}`}>
                {getModeLabel(currentMode)}
              </span>
              <Link to="/" className="terminal-btn text-[10px]">
                Back home
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className={isPage ? 'grid gap-0 lg:grid-cols-[1.15fr_0.85fr]' : ''}>
        <div className={isPage ? 'border-r border-border' : ''}>
          <ScrollArea className={isPage ? 'h-[calc(100vh-12rem)] min-h-[28rem] border-b border-border bg-background/82' : 'h-[24rem] border-b border-border bg-background/82'}>
            <div className="space-y-3 px-4 py-4">
              {!messages.some((message) => message.role === 'user') && (
                <div className="rounded-sm border border-dashed border-primary/30 bg-primary/14 p-3 text-sm text-muted-foreground">
                  <div className="mb-2 text-[10px] uppercase tracking-[0.24em] text-primary">
                    {t('assistant.tryAsking', 'Try asking')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="tag text-[10px] hover:border-primary hover:bg-primary/15"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[92%] rounded-sm border px-3 py-3 ${
                    message.role === 'assistant'
                      ? 'border-primary/30 bg-primary/14 text-foreground'
                      : 'ml-auto border-border bg-secondary/88 text-foreground'
                  }`}
                >
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    <span>
                      {message.role === 'assistant'
                        ? t('assistant.title', 'Simba Assist')
                        : t('assistant.you', 'You')}
                    </span>
                    {message.role === 'assistant' && message.mode && (
                      <span className={`tag ${getModeTone(message.mode)}`}>{getModeLabel(message.mode)}</span>
                    )}
                  </div>
                  <div className="text-sm leading-relaxed">{message.text}</div>

                  {message.supportReply && (
                    <div className="mt-3 rounded-sm border border-border/60 bg-background/70 p-3 text-sm">
                      <div className="mb-1 text-[10px] uppercase tracking-[0.22em] text-primary">Support</div>
                      <p>{message.supportReply}</p>
                      {message.supportUrl && (
                        <p className="mt-2">
                          <Link to={message.supportUrl} className="text-primary underline">
                            Open support
                          </Link>
                        </p>
                      )}
                    </div>
                  )}

                  {message.recipe && (
                    <div className="mt-3 rounded-sm border border-border/60 bg-background/70 p-3 text-sm">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-primary">
                        Recipe plan
                      </div>
                      <div className="font-semibold text-foreground">{message.recipe.title}</div>
                      <div className="text-xs text-muted-foreground">{message.recipe.servings} servings</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {message.recipe.ingredients.map((ingredient) => (
                          <span key={ingredient} className="tag text-[10px]">
                            {ingredient}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.shoppingPlan && (
                    <div className="mt-3 rounded-sm border border-border/60 bg-background/70 p-3 text-sm">
                      <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-primary">
                        Shopping plan
                      </div>
                      <div className="font-semibold text-foreground">{message.shoppingPlan.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {message.shoppingPlan.peopleCount ? `${message.shoppingPlan.peopleCount} people` : 'Branch-aware list'}
                      </div>
                    </div>
                  )}

                  {message.products && message.products.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.products.map((product) => (
                        <Link
                          key={product.id}
                          to={`/product/${product.id}`}
                          className="flex items-center gap-3 border border-border bg-card/92 p-2 transition-colors hover:border-primary/60"
                          onClick={() => !isPage && setIsOpen(false)}
                        >
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-border bg-secondary/40">
                            <img
                              src={product.image}
                              alt={product.name}
                              className="h-full w-full object-contain p-1"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs uppercase tracking-[0.18em] text-muted-foreground">
                              {product.category}
                            </div>
                            <div className="line-clamp-2 text-sm text-foreground">{product.name}</div>
                          </div>
                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold text-primary crt-glow">
                              {formatRWF(getProductPrice(product))}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {product.in_stock ? t('assistant.inStock', 'In stock') : t('assistant.outOfStock', 'Out')}
                            </div>
                          </div>
                        </Link>
                      ))}

                      {message.query && (
                        <Link
                          to={buildShopSearchUrl(message.query, message.products || [])}
                          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-primary hover:text-accent"
                          onClick={() => !isPage && setIsOpen(false)}
                        >
                          <MessageCircle className="h-3 w-3" />
                          Open in shop
                        </Link>
                      )}
                    </div>
                  )}
                </article>
              ))}

              {isReplying && (
                <div className="max-w-[92%] rounded-sm border border-primary/30 bg-primary/14 px-3 py-3 text-sm text-muted-foreground">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-primary">
                    {t('assistant.title', 'Simba Assist')}
                  </div>
                  <div className="cursor-blink">{t('assistant.thinking', 'Thinking through your shopping request...')}</div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {isPage && (
            <div className="space-y-3 bg-card/98 px-4 py-4">
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('assistant.placeholder', 'Ask for products, meal ideas, or best deals...')}
                className="min-h-[74px] resize-none border-border bg-background/88 text-sm"
              />

              <div className="flex items-center justify-between gap-3">
                <div className="text-[11px] text-muted-foreground">
                  {t('assistant.footerHint', 'Press Enter to send, Shift+Enter for a new line.')}
                </div>
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!draft.trim() || isReplying}
                  className="rounded-full px-4"
                >
                  {t('assistant.send', 'Send')}
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>

        {isPage && (
          <aside className="border-t border-border bg-background/90 lg:border-l lg:border-t-0">
            <ScrollArea className="h-[calc(100vh-12rem)] min-h-[28rem]">
              <div className="space-y-4 p-5">
                <div className="industrial-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Context</div>
                      <div className="mt-1 text-lg font-display text-primary crt-glow">{resolvedPageTitle}</div>
                    </div>
                    <span className={`tag uppercase ${getModeTone(latestAssistant?.mode || currentMode)}`}>
                      {getModeLabel(latestAssistant?.mode || currentMode)}
                    </span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="data-row">
                      <span className="label">Branch</span>
                      <span className="value">{branch}</span>
                    </div>
                    <div className="data-row">
                      <span className="label">Role</span>
                      <span className="value">{user?.role || 'guest'}</span>
                    </div>
                    <div className="data-row">
                      <span className="label">Confidence</span>
                      <span className="value">{Math.round(confidence * 100)}%</span>
                    </div>
                    <div className="data-row">
                      <span className="label">Page hint</span>
                      <span className="value">{latestAssistant?.explanation || 'Ask anything about shopping.'}</span>
                    </div>
                    <div className="data-row">
                      <span className="label">Cart</span>
                      <span className="value">{cartSummary}</span>
                    </div>
                  </div>
                </div>

                <div className="industrial-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-display text-primary">&gt; Actions</h2>
                    <span className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                      {latestActions.length} available
                    </span>
                  </div>
                  <div className="space-y-2">
                    {latestActions.length > 0 ? latestActions.map((action, index) => (
                      <button
                        key={('id' in action ? (action as any).id : `${action.type}-${action.label}-${index}`)}
                        type="button"
                        onClick={() => applyAction(action, latestAssistant)}
                        className="flex w-full items-start justify-between gap-3 border border-border bg-secondary/20 px-3 py-2 text-left hover:border-primary/60"
                      >
                        <div>
                          <div className="text-xs uppercase tracking-[0.2em] text-primary">{action.label}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{action.description || action.type}</div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    )) : (
                      <div className="text-sm text-muted-foreground">Ask about products, recipes, or your cart to unlock actions.</div>
                    )}
                  </div>
                </div>

                <div className="industrial-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-display text-primary">&gt; Recommendations</h2>
                    <button type="button" className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground" onClick={() => setDraft(quickPrompts[0] || '')}>
                      Use prompt
                    </button>
                  </div>
                  {latestProducts.length > 0 ? (
                    <div className="space-y-2">
                      {latestProducts.map((product) => (
                        <div key={product.id} className="border border-border bg-secondary/20 p-2">
                          <div className="flex items-center gap-3">
                            <div className="h-12 w-12 shrink-0 border border-border bg-background/80">
                              <img src={product.image} alt={product.name} className="h-full w-full object-contain p-1" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm text-foreground">{product.name}</div>
                              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                                {product.category}
                              </div>
                              <div className="mt-1 text-sm font-semibold text-primary crt-glow">
                                {formatRWF(getProductPrice(product))}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-col gap-2">
                              <Link to={`/product/${product.id}`} className="terminal-btn text-[10px]">Open</Link>
                              <button
                                type="button"
                                className="terminal-btn text-[10px]"
                                onClick={() =>
                                  addItem({
                                    product_id: product.id,
                                    product_name: product.name,
                                    price: getProductPrice(product),
                                    image: product.image,
                                    branch,
                                    unit: product.unit || undefined,
                                    max_quantity: product.branch_stock && typeof product.branch_stock === 'object'
                                      ? Number(product.branch_stock[branch] || 0) || undefined
                                      : product.stock_count || undefined,
                                  }, 1)
                                }
                              >
                                <Plus className="h-3 w-3" /> Add
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No product matches yet. Ask for a recipe, category, or price range.</div>
                  )}
                </div>

                {latestRecipe && (
                  <div className="industrial-border bg-card p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="text-sm font-display text-primary">&gt; Recipe</h2>
                      <button type="button" className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground" onClick={() => latestRecipe.addAllProductIds.forEach((productId) => {
                        const product = products.find((item) => item.id === productId);
                        if (!product) return;
                        addItem({
                          product_id: product.id,
                          product_name: product.name,
                          price: getProductPrice(product),
                          image: product.image,
                          branch,
                          unit: product.unit || undefined,
                        }, 1);
                      })}>
                        Add all
                      </button>
                    </div>
                    <div className="text-sm text-foreground">{latestRecipe.title}</div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>Servings: {latestRecipe.servings}</div>
                      <div>Missing: {latestRecipe.missingIngredients.length > 0 ? latestRecipe.missingIngredients.join(', ') : 'None'}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {latestRecipe.ingredients.map((ingredient) => (
                        <span key={ingredient} className="tag text-[10px]">{ingredient}</span>
                      ))}
                    </div>
                  </div>
                )}

                {latestShoppingPlan && (
                  <div className="industrial-border bg-card p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h2 className="text-sm font-display text-primary">&gt; Shopping plan</h2>
                      <button type="button" className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground" onClick={() => latestShoppingPlan.addAllProductIds.forEach((productId) => {
                        const product = products.find((item) => item.id === productId);
                        if (!product) return;
                        addItem({
                          product_id: product.id,
                          product_name: product.name,
                          price: getProductPrice(product),
                          image: product.image,
                          branch,
                          unit: product.unit || undefined,
                        }, 1);
                      })}>
                        Add all
                      </button>
                    </div>
                    <div className="text-sm text-foreground">{latestShoppingPlan.title}</div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div>People: {latestShoppingPlan.peopleCount || '-'}</div>
                      <div>Missing: {latestShoppingPlan.missingItems.length > 0 ? latestShoppingPlan.missingItems.join(', ') : 'None'}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {latestShoppingPlan.items.map((item) => (
                        <span key={item} className="tag text-[10px]">{item}</span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="industrial-border bg-card p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-sm font-display text-primary">&gt; Memory</h2>
                    <button type="button" className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground" onClick={() => clear()}>
                      Clear cart
                    </button>
                  </div>
                  <div className="space-y-2 text-xs text-muted-foreground">
                    <div>Goal: {simbaContext.memory.currentGoal || 'None'}</div>
                    <div>Recipe: {simbaContext.memory.currentRecipe || 'None'}</div>
                    <div>Shopping list: {simbaContext.memory.currentShoppingList?.join(', ') || 'None'}</div>
                    <div>Last page: {simbaContext.memory.currentPageType || 'unknown'}</div>
                    <div>Last branch: {simbaContext.memory.currentBranch || branch}</div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </aside>
        )}
      </div>

      {!isPage && (
        <div className="space-y-3 bg-card/98 px-4 py-4">
          <Textarea
            ref={textareaRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('assistant.placeholder', 'Ask for products, meal ideas, or best deals...')}
            className="min-h-[74px] resize-none border-border bg-background/88 text-sm"
          />

          <div className="flex items-center justify-between gap-3">
            <div className="text-[11px] text-muted-foreground">
              {t('assistant.footerHint', 'Press Enter to send, Shift+Enter for a new line.')}
            </div>
            <div className="flex items-center gap-2">
              <Link to="/assistant" className="terminal-btn text-[10px]">
                Full assistant
              </Link>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!draft.trim() || isReplying}
                className="rounded-full px-4"
              >
                {t('assistant.send', 'Send')}
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  if (isPage) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6">
        {conversationPanel}
      </div>
    );
  }

  if (hidden) {
    return null;
  }

  return (
    <>
      {/* Floating trigger button (layer 20) */}
      <div className="fixed bottom-4 right-4 z-20 md:bottom-6 md:right-6">
        <div className="relative flex flex-col items-end gap-3">
          {showGreeting && !isOpen && (
            <div className="flex items-center gap-2 pr-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(true);
                  setShowGreeting(false);
                }}
                className="text-right text-sm leading-none text-primary crt-glow transition-colors hover:text-accent"
              >
                {t('assistant.nudge', 'Hi, chat with me.')}
              </button>
              <button
                type="button"
                onClick={() => setShowGreeting(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-border/70 bg-background/70 text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
                aria-label={t('assistant.dismiss', 'Dismiss greeting')}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setIsOpen((current) => !current);
              setShowGreeting(false);
            }}
            className="group relative flex h-16 w-16 items-center justify-center rounded-full border border-primary/60 bg-card shadow transition-all hover:-translate-y-0.5 hover:border-primary"
            aria-label={isOpen ? t('assistant.close', 'Close assistant') : t('assistant.open', 'Open assistant')}
          >
            <span className="absolute inset-0 rounded-full bg-primary/8 opacity-0 transition-opacity group-hover:opacity-100" />
            <img
              src={BRAND_LOGO_URL}
              alt={BRAND_TITLE}
              className="relative h-10 w-10 rounded-full border border-primary/40 bg-black object-contain p-1"
            />
            {!isOpen && (
              <span className="absolute -right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[9px] font-bold text-accent-foreground">
                <Sparkles className="h-2.5 w-2.5" />
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Backdrop (layer 30) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer (layer 30) */}
      <div className={`fixed top-0 right-0 z-30 h-full w-[min(100%,420px)] transform transition-transform duration-200 ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full">
          {conversationPanel}
        </div>
      </div>
    </>
  );
}
