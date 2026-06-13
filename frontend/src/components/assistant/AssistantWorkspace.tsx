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
      return 'border-[#d6ff38]/30 bg-[#d6ff38]/10 text-[#d6ff38]';
    case 'meal_planning':
    case 'shopping_planner':
      return 'border-[#d6ff38]/30 bg-[#d6ff38]/10 text-[#d6ff38]';
    case 'support':
    case 'customer_support':
    case 'support_question':
      return 'border-current/20 bg-current/5 text-muted-foreground';
    case 'order_tracking':
      return 'border-current/20 bg-current/5 text-muted-foreground';
    case 'product_comparison':
    case 'product_expert':
      return 'border-current/20 bg-current/5 text-muted-foreground';
    case 'cart_optimization':
    case 'cart_builder':
      return 'border-[#d6ff38]/30 bg-[#d6ff38]/10 text-[#d6ff38]';
    case 'inventory_check':
    case 'branch_assistant':
      return 'border-current/20 bg-current/5 text-muted-foreground';
    case 'promotion_search':
      return 'border-[#d6ff38]/30 bg-[#d6ff38]/10 text-[#d6ff38]';
    case 'general_chat':
      return 'border-current/10 bg-current/5 text-muted-foreground/40';
    default:
      return 'border-current/20 bg-current/5 text-muted-foreground';
  }
}

const THINKING_STEPS = [
  '🔍 Searching products...',
  '🏪 Checking inventory...',
  '💰 Comparing prices...',
  '✨ Preparing recommendations...',
];

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
  const [thinkingStep, setThinkingStep] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Handle rotating thinking messages
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isReplying) {
      interval = setInterval(() => {
        setThinkingStep((prev) => (prev + 1) % THINKING_STEPS.length);
      }, 2000);
    } else {
      setThinkingStep(0);
    }
    return () => clearInterval(interval);
  }, [isReplying]);

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

    try {
      const result = await runSimbaSearch(query, products, 6, branch, assistantContext);
      const resultProducts = result.products.slice(0, 6);
      
      const assistantMessage: ChatMessage = {
        id: createId('assistant'),
        role: 'assistant',
        text: result.message,
        products: resultProducts,
        query,
        mode: result.mode,
        confidence: result.confidence,
        explanation: result.explanation,
        suggestions: result.suggestions,
        actions: result.actions,
        supportReply: result.supportReply,
        supportUrl: result.supportUrl,
        recipe: result.recipe,
        shoppingPlan: result.shoppingPlan,
      };

      setMessages((current) => [...current, assistantMessage]);
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
    } catch (err) {
      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          text: t('assistant.error', 'I could not search the catalog right now. Please try again.'),
        },
      ]);
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
    <section className={isPage 
      ? 'flex flex-col h-full overflow-hidden bg-background border border-[#d6ff38]/40 rounded-2xl shadow-2xl' 
      : 'flex flex-col h-full overflow-hidden bg-background/95 dark:bg-[#0a0f0a]/95 backdrop-blur-xl border border-[#d6ff38]/30 shadow-[0_0_40px_rgba(0,0,0,0.8)] rounded-2xl'
    }>
      {!isPage && (
        <div className="border-b border-border bg-muted/30 px-4 py-5 md:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-[#d6ff38]/20 bg-black/40">
                <img src={BRAND_LOGO_URL} alt={BRAND_TITLE} className="h-8 w-8 object-contain" />
              </div>
              <div>
                <div className="font-display text-xl uppercase leading-tight text-[#d6ff38] crt-glow">
                  {t('assistant.title', 'Simba Assist')}
                </div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
                  {t('assistant.subtitle', 'PRODUCT SEARCH • CARTS • DEALS')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Link to="/assistant" className="terminal-btn hidden md:flex text-[10px] whitespace-nowrap px-5 min-w-[120px]">
                Full assistant
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="shrink-0 rounded-full border border-border bg-background/50 text-muted-foreground hover:text-[#d6ff38] hover:bg-accent"
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
        <div className="border-b border-[#d6ff38]/20 bg-[#111611] px-5 py-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">{resolvedPageTitle}</div>
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
          <ScrollArea className={isPage ? 'h-[calc(100vh-12rem)] min-h-[28rem] border-b border-border bg-background' : 'flex-1 h-[400px] md:h-[500px] bg-background/40'}>
            <div className="space-y-3 px-4 py-4">
              {!messages.some((message) => message.role === 'user') && (
                <div className="industrial-border bg-muted/40 p-4">
                  <div className="mb-3 text-[10px] uppercase tracking-[0.24em] text-[#d6ff38]/60 font-bold">
                    {t('assistant.tryAsking', 'Try asking')}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => void sendMessage(prompt)}
                        className="terminal-btn text-[10px]"
                      >
                        [ {prompt.toUpperCase()} ]
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((message) => (
                <article
                  key={message.id}
                  className={`max-w-[92%] border px-4 py-4 shadow-sm ${
                    message.role === 'assistant'
                      ? 'border-border bg-card/80 backdrop-blur-md text-card-foreground rounded-tr-xl rounded-br-xl rounded-bl-xl'
                      : 'ml-auto border-[#d6ff38]/40 bg-[#d6ff38]/10 text-foreground rounded-tl-xl rounded-bl-xl rounded-br-xl'
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.24em] text-muted-foreground/60 font-bold">
                    <span>
                      {message.role === 'assistant'
                        ? t('assistant.title', 'Simba Assist')
                        : t('assistant.you', 'You')}
                    </span>
                    {message.role === 'assistant' && message.mode && (
                      <span className={`tag ${getModeTone(message.mode)}`}>{getModeLabel(message.mode)}</span>
                    )}
                  </div>
                  <div className="text-lg leading-[1.7] font-medium">{message.text}</div>

                  {message.supportReply && (
                    <div className="mt-3 rounded-sm border border-border bg-muted/50 p-3 text-sm">
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
                <article className="max-w-[88%] border border-border bg-muted/30 px-4 py-4 flex flex-col gap-3 rounded-tr-xl rounded-br-xl rounded-bl-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <div className="flex items-center justify-between gap-2 text-[9px] uppercase tracking-[0.24em] text-muted-foreground/40 font-bold">
                    <span>{t('assistant.title', 'Simba Assist')}</span>
                    <Sparkles className="h-3 w-3 text-[#d6ff38] animate-pulse" />
                  </div>
                  
                  <div className="flex flex-col gap-2.5">
                    {/* Typing Indicator Dots */}
                    <div className="flex gap-1.5 items-center h-4 ml-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#d6ff38] animate-bounce [animation-duration:0.8s] [animation-delay:-0.3s]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#d6ff38] animate-bounce [animation-duration:0.8s] [animation-delay:-0.15s]"></span>
                      <span className="w-1.5 h-1.5 rounded-full bg-[#d6ff38] animate-bounce [animation-duration:0.8s]"></span>
                    </div>
                    
                    {/* Rotating Status Text */}
                    <div className="text-sm text-muted-foreground font-medium transition-all duration-500">
                      {THINKING_STEPS[thinkingStep]}
                    </div>
                  </div>
                </article>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          {isPage && (
            <div className="space-y-4 bg-muted/20 border-t border-border px-4 py-6">
              <Textarea
                ref={textareaRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('assistant.placeholder', 'Ask for products, deals, or meal ideas...')}
                className="min-h-[80px] resize-none border-border bg-background text-base"
              />

              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {t('assistant.footerHint', 'Press Enter to send, Shift+Enter for a new line.')}
                </div>
                <Button
                  type="button"
                  onClick={() => void handleSubmit()}
                  disabled={!draft.trim() || isReplying}
                  className="rounded-full px-6 h-11"
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
                <div className="industrial-border bg-card p-5">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div>
                      <div className="text-xs uppercase tracking-[0.28em] text-muted-foreground">Context</div>
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
                      {latestActions.length} READY
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
                      <button type="button" className="text-xs uppercase tracking-[0.24em] text-muted-foreground hover:text-primary" onClick={() => latestRecipe.addAllProductIds.forEach((productId) => {
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
                      <button type="button" className="text-xs uppercase tracking-[0.24em] text-muted-foreground hover:text-primary" onClick={() => latestShoppingPlan.addAllProductIds.forEach((productId) => {
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
        <div className="mt-auto p-4 md:p-6 bg-muted/40 border-t border-border">
          <div className="relative bg-background border border-border p-2 shadow-sm rounded-xl">
            <Textarea
              ref={textareaRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('assistant.placeholder', 'Ask for products or deals...')}
              className="min-h-[60px] w-full resize-none border-0 bg-transparent text-foreground placeholder:text-muted-foreground/50 focus-visible:ring-0 focus-visible:ring-offset-0 px-3 py-2 text-base font-sans"
            />
            <div className="flex items-center justify-between px-2 pb-1">
              <div className="text-[10px] text-muted-foreground/60 uppercase tracking-widest hidden md:block">
                &gt; USER_INPUT_REQUIRED
              </div>
              <Button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={!draft.trim() || isReplying}
                className="terminal-btn h-8 px-4 border-[#d6ff38] text-[#d6ff38] hover:bg-[#d6ff38]/10 shadow-[0_0_15px_rgba(214,255,56,0.1)] transition-all active:scale-95 disabled:opacity-30"
              >
                <span className="text-[10px] uppercase tracking-widest">Transmit</span>
                <ArrowUp className="ml-2 h-3 w-3" />
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
      {/* Floating trigger button (layer 100) - Elevated to clear bottom menu bars */}
      <div className="fixed bottom-24 right-4 z-[100] md:bottom-8 md:right-8">
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

      {/* Backdrop (layer 110) */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-[4px]"
          onClick={() => setIsOpen(false)}
          aria-hidden
        />
      )}

      {/* Drawer (layer 110) - Floating Card Layout */}
      <div className={`fixed right-0 bottom-0 md:top-auto z-[110] h-[calc(100dvh-16px)] md:h-[min(840px,calc(100dvh-48px))] w-full md:w-[460px] p-3 md:p-6 transition-all duration-300 ease-in-out ${isOpen ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'}`}>
        {conversationPanel}
      </div>
    </>
  );
}
