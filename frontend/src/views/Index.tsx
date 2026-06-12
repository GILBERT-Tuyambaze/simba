import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgePercent,
  Clock,
  CreditCard,
  Flame,
  MapPin,
  Package,
  Shield,
  ShoppingBag,
  Sparkles,
  Star,
  Truck,
  Zap,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductCard from '@/components/products/ProductCard';
import { useProducts } from '@/hooks/useProducts';
import { useI18n } from '@/lib/i18n';
import { formatRWF, type Product } from '@/lib/types';

function productPrice(product: Product): number {
  const value = Number(String(product.price ?? 0).replace(/,/g, ''));
  return Number.isFinite(value) ? value : 0;
}

function discountedPrice(product: Product): number {
  const price = productPrice(product);
  const discount = Number(product.discount || 0);
  const rawPrice = discount > 0
    ? price * (1 - discount / 100)
    : price;
  return Math.round(rawPrice);
}

export default function Index() {
  const { products, loading, total } = useProducts({ limit: 96 });
  const { t, translateCategory } = useI18n();

  const categoryStats = useMemo(() => {
    const map = new Map<string, number>();
    products.forEach((product) => {
      map.set(product.category, (map.get(product.category) || 0) + 1);
    });

    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [products]);

  const hotDeals = useMemo(() => {
    return [...products]
      .filter((product) => product.discount > 0)
      .sort((a, b) => b.discount - a.discount || b.rating - a.rating || productPrice(a) - productPrice(b))
      .slice(0, 8);
  }, [products]);

  const bestSellers = useMemo(() => {
    return [...products]
      .sort((a, b) => b.rating - a.rating || b.discount - a.discount || productPrice(a) - productPrice(b))
      .slice(0, 8);
  }, [products]);

  const valuePicks = useMemo(() => {
    return [...products]
      .filter((product) => product.in_stock)
      .sort((a, b) => discountedPrice(a) - discountedPrice(b) || b.rating - a.rating)
      .slice(0, 8);
  }, [products]);

  const heroProducts = useMemo(() => {
    const pool = [
      hotDeals[0],
      bestSellers[0],
      valuePicks[0],
      hotDeals[1],
      bestSellers[1],
      valuePicks[1],
    ].filter(Boolean) as Product[];

    const seen = new Set<number>();
    return pool.filter((product) => {
      if (seen.has(product.id)) {
        return false;
      }
      seen.add(product.id);
      return true;
    }).slice(0, 5);
  }, [bestSellers, hotDeals, valuePicks]);

  const heroCount = total || products.length;
  const topDiscount = hotDeals[0]?.discount || 0;

  const summaryCards = [
    {
      icon: Package,
      label: t('landing.trust.products'),
      value: heroCount.toLocaleString('en-US'),
      sub: 'Everyday market essentials',
    },
    {
      icon: BadgePercent,
      label: 'PROMOS',
      value: `${topDiscount || 0}%`,
      sub: 'Selected items on sale',
    },
    {
      icon: Sparkles,
      label: t('landing.trust.branches'),
      value: '9',
      sub: t('landing.trustBranchSub'),
    },
    {
      icon: Truck,
      label: t('landing.trust.delivery'),
      value: '45M',
      sub: t('landing.trustDeliverySub'),
    },
  ];

  const retailFeatures = [
    {
      icon: Truck,
      title: t('landing.deliveryPickup'),
      sub: t('landing.deliveryPickupSub'),
    },
    {
      icon: Shield,
      title: t('landing.secureCheckout'),
      sub: t('landing.secureCheckoutSub'),
    },
    {
      icon: Clock,
      title: t('landing.freshStockDaily'),
      sub: t('landing.freshStockDailySub'),
    },
    {
      icon: Zap,
      title: t('landing.quickReorder'),
      sub: t('landing.quickReorderSub'),
    },
  ];

  const heroChips = [
    { icon: Truck, label: '45-min delivery' },
    { icon: CreditCard, label: 'MoMo payment' },
    { icon: MapPin, label: 'Real Kigali branches' },
  ];

  const whyCards = [
    ...summaryCards.map((card) => ({
      icon: card.icon,
      title: card.label,
      value: card.value,
      sub: card.sub,
    })),
    ...retailFeatures.map((item) => ({
      icon: item.icon,
      title: item.title,
      value: '',
      sub: item.sub,
    })),
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <section className="hero-surface relative flex min-h-[calc(100vh-4rem)] items-center overflow-hidden border-b border-border">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute inset-0 scanlines-strong pointer-events-none" />

        <div className="relative z-10 mx-auto w-full max-w-7xl px-4 py-24 sm:py-28 md:py-36">
          <div className="hero-copy max-w-3xl">
            <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_8px_28px_rgba(0,0,0,0.2)] backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {'\uD83C\uDDF7\uD83C\uDDFC'} Rwanda&apos;s #1 Online Supermarket
            </div>

            <h1 className="max-w-4xl font-display text-5xl leading-none text-white sm:text-6xl md:text-7xl lg:text-8xl">
              Fresh groceries, <span className="text-accent">fast</span> delivery
            </h1>
            <p className="mt-5 max-w-2xl text-base font-medium leading-7 text-white/80 md:text-lg">
              Shop daily essentials from Simba branches across Kigali with quick delivery or pickup.
            </p>

            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {heroChips.map((chip) => {
                const Icon = chip.icon;
                return (
                  <div
                    key={chip.label}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm sm:justify-start"
                  >
                    <Icon className="h-4 w-4 text-accent" />
                    {chip.label}
                  </div>
                );
              })}
            </div>

            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link
                to="/shop"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-accent bg-accent px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-accent-foreground shadow-[0_12px_30px_rgba(245,158,11,0.22)] transition-all hover:-translate-y-0.5 hover:bg-accent/90"
              >
                Start Shopping <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/checkout"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/35 bg-white/10 px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition-all hover:-translate-y-0.5 hover:border-accent hover:bg-accent/10 hover:text-accent"
              >
                <Truck className="h-4 w-4" />
                Order for Pickup
              </Link>
              <a
                href="#best-sellers"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 bg-black/20 px-5 py-3 text-sm font-bold uppercase tracking-[0.16em] text-white transition-all hover:-translate-y-0.5 hover:border-white/60 hover:bg-white/10"
              >
                <Star className="h-4 w-4" />
                Best Sellers
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border bg-secondary/10">
        <div className="mx-auto max-w-7xl px-4 py-12 md:py-16">
          <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.24em] text-accent">
                Why Shop With Us
              </div>
              <h2 className="mt-1 text-3xl font-display text-primary crt-glow">
                Built for Kigali grocery runs
              </h2>
            </div>
            <Link to="/shop" className="terminal-btn text-xs">
              Browse aisles
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {whyCards.map((card) => {
              const Icon = card.icon;
              return (
                <div key={`${card.title}-${card.value || card.sub}`} className="why-shop-card border border-border bg-card/80 p-5">
                  <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                    <Icon className="h-5 w-5" />
                  </div>
                  {card.value && (
                    <div className="text-3xl font-display text-primary crt-glow">
                      {card.value}
                    </div>
                  )}
                  <div className="mt-1 text-sm font-display text-primary">
                    {card.title}
                  </div>
                  <div className="mt-2 text-xs uppercase tracking-[0.14em] text-muted-foreground">
                    {card.sub}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-accent">
              <Flame className="h-3.5 w-3.5" />
              Today&apos;s Top Picks
            </div>
            <h2 className="mt-1 text-3xl font-display text-primary crt-glow">
              Fresh picks ready now
            </h2>
          </div>
          <Link to="/shop" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
            View all products
          </Link>
        </div>

        {loading && heroProducts.length === 0 ? (
          <div className="border border-dashed border-border py-16 text-center text-muted-foreground">
            {t('landing.loadingCatalog')}
          </div>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 pb-4">
            <div className="flex min-w-full snap-x gap-4">
              {heroProducts.map((product) => (
                <Link
                  key={product.id}
                  to={`/product/${product.id}`}
                  className="group min-w-[240px] snap-start border border-border bg-card/80 p-4 transition-all hover:-translate-y-1 hover:border-primary hover:shadow-[0_18px_34px_hsl(var(--primary)/0.12)] sm:min-w-[280px]"
                >
                  <div className="mb-4 flex aspect-[4/3] items-center justify-center overflow-hidden border border-border bg-background/80">
                    <img
                      src={product.image}
                      alt={product.name}
                      className="h-full w-full object-contain p-3 transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {translateCategory(product.category)}
                  </div>
                  <div className="mt-2 line-clamp-2 min-h-[2.5rem] text-sm font-semibold text-foreground">
                    {product.name}
                  </div>
                  <div className="mt-3 flex items-end justify-between gap-3">
                    <div>
                      {Number(product.discount || 0) > 0 && (
                        <div className="text-[10px] line-through text-muted-foreground">
                          {formatRWF(productPrice(product))}
                        </div>
                      )}
                      <div className="text-lg font-bold text-primary crt-glow">
                        {formatRWF(discountedPrice(product))}
                      </div>
                    </div>
                    {Number(product.discount || 0) > 0 ? (
                      <span className="rounded-full border border-accent/40 bg-accent/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-accent">
                        -{product.discount}%
                      </span>
                    ) : (
                      <ShoppingBag className="h-5 w-5 text-accent" />
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <section id="hot-deals" className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent flex items-center gap-2">
              <Flame className="h-3 w-3" /> {t('landing.hotDeals')}
            </div>
            <h2 className="text-3xl font-display text-accent crt-glow">
              {t('landing.topSalePicks')}
            </h2>
          </div>
          <Link to="/shop?sale=1" className="terminal-btn text-xs">
            {t('landing.viewAllDeals')}
          </Link>
        </div>
        {loading && hotDeals.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {t('landing.loadingHotDeals')}
          </div>
        ) : hotDeals.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {hotDeals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 border border-dashed border-border">
            <div className="text-muted-foreground mb-2">{t('landing.noSaleItems')}</div>
            <Link to="/shop" className="terminal-btn text-xs">
              {t('landing.browseAllProducts')}
            </Link>
          </div>
        )}
      </section>

      <section id="best-sellers" className="border-y border-border bg-secondary/10">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                {t('landing.customerFavorites')}
              </div>
              <h2 className="text-3xl font-display text-primary crt-glow">
                {t('landing.bestSellersHeading')}
              </h2>
            </div>
            <Link to="/shop" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
              {t('landing.viewAllProducts')}
            </Link>
          </div>
          {loading && bestSellers.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              {t('landing.loadingBestSellers')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
              {bestSellers.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section id="value-picks" className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {t('landing.everyDayValue')}
            </div>
            <h2 className="text-3xl font-display text-primary crt-glow">
              {t('landing.valuePicks')}
            </h2>
          </div>
          <Link to="/shop" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
            {t('landing.shopMore')}
          </Link>
        </div>
        {loading && valuePicks.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            {t('landing.loadingValuePicks')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {valuePicks.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">
              {t('landing.shopByCategory')}
            </div>
            <h2 className="text-3xl font-display text-primary crt-glow">
              {t('landing.popularAisles')}
            </h2>
          </div>
          <Link to="/shop" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
            {t('landing.exploreAll')}
          </Link>
        </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {categoryStats.map((category) => (
            <Link
              key={category.name}
              to={`/shop?category=${encodeURIComponent(category.name)}`}
              className="card-industrial p-4 text-left group"
            >
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {t('landing.category')}
              </div>
              <div className="mt-2 text-lg font-display text-primary group-hover:crt-glow">
                {translateCategory(category.name)}
              </div>
              <div className="mt-2 text-xs text-accent">
                {t('landing.itemsCount', { count: category.count })}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="industrial-border bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-8 md:p-12 scanlines relative overflow-hidden">
          <div className="relative z-10 grid md:grid-cols-2 gap-6 items-center">
            <div>
              <div className="text-xs uppercase tracking-widest text-accent mb-2">
                [LIMITED OFFER]
              </div>
              <h3 className="text-3xl md:text-4xl font-display text-primary crt-glow">
                FIRST ORDER? GET {formatRWF(2000)} OFF
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Use code <span className="text-accent font-bold">SIMBA2K</span> at checkout.
                Minimum spend {formatRWF(15000)}. New accounts only.
              </p>
            </div>
            <div className="flex md:justify-end">
              <Link to="/shop" className="terminal-btn text-sm flex items-center gap-2">
                START SHOPPING <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
