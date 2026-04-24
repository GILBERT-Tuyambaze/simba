import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUp, MessageCircle, Sparkles, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { runConversationalSearch } from '@/lib/conversational-search';
import { useI18n } from '@/lib/i18n';
import { formatRWF, type Product } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  products?: Product[];
  query?: string;
};

const BRAND_TITLE = import.meta.env.VITE_APP_TITLE?.trim() || 'Simba Supermarket';
const BRAND_LOGO_URL = import.meta.env.VITE_APP_LOGO_URL?.trim() || '/android-chrome-192x192.png';
const GREETING_STORAGE_KEY = 'simba_store_assistant_greeted_v1';

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

export default function StoreAssistant() {
  const location = useLocation();
  const { user } = useAuth();
  const { products, loading: productsLoading } = useProducts();
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [showGreeting, setShowGreeting] = useState(false);
  const [draft, setDraft] = useState('');
  const [isReplying, setIsReplying] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const hidden = location.pathname.startsWith('/admin');
  const displayName = getDisplayName(user?.name, user?.email);
  const welcomeText = displayName
    ? `${t('assistant.welcomeBack', 'Hi')} ${displayName}. ${t('assistant.welcomeBody', 'Ask me for fresh milk, breakfast ideas, deals, or products for your cart.')}`
    : t('assistant.welcome', 'Hi. Ask me for fresh milk, breakfast ideas, deals, or products for your cart.');

  const quickPrompts = useMemo(
    () => [
      t('assistant.quickMilk', 'Fresh milk'),
      t('assistant.quickBreakfast', 'Breakfast ideas'),
      t('assistant.quickDeals', 'Best deals'),
      t('assistant.quickEssentials', 'Home essentials'),
    ],
    [t]
  );

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
    if (hidden) {
      setIsOpen(false);
      setShowGreeting(false);
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
  }, [hidden]);

  useEffect(() => {
    if (isOpen) {
      textareaRef.current?.focus();
    }
  }, [isOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isReplying, isOpen]);

  if (hidden) {
    return null;
  }

  const sendMessage = async (rawQuery: string) => {
    const query = rawQuery.trim();
    if (!query || isReplying) {
      return;
    }

    setDraft('');
    setIsOpen(true);
    setShowGreeting(false);
    setMessages((current) => [
      ...current,
      {
        id: createId('user'),
        role: 'user',
        text: query,
      },
    ]);

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
      const result = await runConversationalSearch(query, products, 4);
      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          text: result.message || t('assistant.defaultReply', 'Here are the closest Simba matches I found.'),
          products: result.products.slice(0, 4),
          query,
        },
      ]);
    } catch {
      setMessages((current) => [
        ...current,
        {
          id: createId('assistant'),
          role: 'assistant',
          text: t('assistant.error', 'I could not search the catalog right now. Please try again.'),
        },
      ]);
    } finally {
      setIsReplying(false);
    }
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

  return (
    <>
      <div className="fixed bottom-4 right-4 z-50 md:bottom-6 md:right-6">
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
            className="group relative flex h-16 w-16 items-center justify-center rounded-full border border-primary/60 bg-card shadow-[0_0_0_1px_hsl(var(--primary)/0.18),0_0_28px_hsl(var(--primary)/0.16)] transition-all hover:-translate-y-0.5 hover:border-primary hover:shadow-[0_0_0_1px_hsl(var(--primary)/0.36),0_0_34px_hsl(var(--primary)/0.22)]"
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

      <div
        className={`fixed bottom-24 right-4 z-50 w-[min(92vw,22rem)] transition-all duration-200 md:bottom-28 md:right-6 ${
          isOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
        }`}
      >
        <section className="industrial-border overflow-hidden bg-card/98 shadow-[0_0_34px_hsl(var(--primary)/0.16)] backdrop-blur-md">
          <div className="border-b border-border bg-secondary/78 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/40 bg-black/70">
                  <img
                    src={BRAND_LOGO_URL}
                    alt={BRAND_TITLE}
                    className="h-7 w-7 object-contain"
                  />
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

          <ScrollArea className="h-[24rem] border-b border-border bg-background/82">
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
                  <div className="mb-1 text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                    {message.role === 'assistant'
                      ? t('assistant.title', 'Simba Assist')
                      : t('assistant.you', 'You')}
                  </div>
                  <div className="text-sm leading-relaxed">{message.text}</div>

                  {message.products && message.products.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {message.products.map((product) => (
                        <Link
                          key={product.id}
                          to={`/product/${product.id}`}
                          className="flex items-center gap-3 border border-border bg-card/92 p-2 transition-colors hover:border-primary/60"
                          onClick={() => setIsOpen(false)}
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
                              {formatRWF(product.discount > 0 ? product.price * (1 - product.discount / 100) : product.price)}
                            </div>
                            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                              {product.in_stock ? t('assistant.inStock', 'In stock') : t('assistant.outOfStock', 'Out')}
                            </div>
                          </div>
                        </Link>
                      ))}

                      {message.query && (
                        <Link
                          to={`/shop?q=${encodeURIComponent(message.query)}`}
                          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-primary hover:text-accent"
                          onClick={() => setIsOpen(false)}
                        >
                          <MessageCircle className="h-3 w-3" />
                          {t('assistant.openResults', 'Open in shop')}
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
                  <div className="cursor-blink">{t('assistant.thinking', 'Searching the catalog...')}</div>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </ScrollArea>

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
        </section>
      </div>
    </>
  );
}
