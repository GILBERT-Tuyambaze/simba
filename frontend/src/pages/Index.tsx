import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgePercent,
  Clock,
  Flame,
  Package,
  Shield,
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

function discountedPrice(product: Product): number {
  const rawPrice = product.discount > 0
    ? product.price * (1 - product.discount / 100)
    : product.price;
  return Math.round(rawPrice);
}

export default function Index() {
  const { products, loading } = useProducts();
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
      .sort((a, b) => b.discount - a.discount || b.rating - a.rating || a.price - b.price)
      .slice(0, 8);
  }, [products]);

  const bestSellers = useMemo(() => {
    return [...products]
      .sort((a, b) => b.rating - a.rating || b.discount - a.discount || a.price - b.price)
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
    ].filter(Boolean) as Product[];

    const seen = new Set<number>();
    return pool.filter((product) => {
      if (seen.has(product.id)) {
        return false;
      }
      seen.add(product.id);
      return true;
    }).slice(0, 4);
  }, [bestSellers, hotDeals, valuePicks]);

  const heroCount = products.length;
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
      sub: 'Real Simba Kigali branches',
    },
    {
      icon: Truck,
      label: t('landing.trust.delivery'),
      value: '45M',
      sub: 'Fast Kigali delivery',
    },
  ];

  const retailFeatures = [
    {
      icon: Truck,
      title: 'Delivery and pickup',
      sub: 'Order online and choose the fastest option.',
    },
    {
      icon: Shield,
      title: 'Secure checkout',
      sub: 'MTN MoMo, Airtel Money, card, or cash on delivery.',
    },
    {
      icon: Clock,
      title: 'Fresh stock daily',
      sub: 'Popular products and promo items updated often.',
    },
    {
      icon: Zap,
      title: 'Quick re-order',
      sub: 'Return to your favorite products in just a few clicks.',
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <section className="relative overflow-hidden border-b border-border bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.18),_transparent_42%),linear-gradient(135deg,_rgba(2,6,23,0.98),_rgba(15,23,42,0.94))]">
        <div className="absolute inset-0 grid-bg opacity-35" />
        <div className="absolute inset-0 scanlines-strong pointer-events-none" />

        <div className="mx-auto max-w-7xl px-4 py-16 md:py-24 relative">
          <div className="grid gap-10 lg:grid-cols-[1.05fr_0.95fr] items-center">
            <div>
              <div className="inline-flex items-center gap-2 border border-primary/50 bg-primary/10 px-3 py-1 text-xs uppercase tracking-wider mb-6">
                <Sparkles className="h-3 w-3" />
                {t('landing.badge')}
              </div>
              <h1 className="font-display text-5xl md:text-7xl text-primary leading-none crt-glow-strong">
                {t('landing.title')}
              </h1>
              <p className="mt-6 text-muted-foreground max-w-lg text-sm md:text-base leading-relaxed">
                {t('landing.subtitle')}
              </p>
              <p className="mt-3 max-w-2xl text-xs uppercase tracking-[0.22em] text-accent">
                {t('landing.valueProps')}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link to="/shop" className="terminal-btn flex items-center gap-2">
                  {t('landing.primaryCta')} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/checkout"
                  className="border border-accent/50 bg-accent/10 text-accent px-4 py-2 uppercase tracking-wider text-sm hover:bg-accent hover:text-accent-foreground transition-all"
                >
                  {t('landing.secondaryCta')}
                </Link>
                <a
                  href="#best-sellers"
                  className="border border-border px-4 py-2 uppercase tracking-wider text-sm hover:border-primary hover:text-primary transition-all"
                >
                  BEST SELLERS
                </a>
              </div>

              <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-2xl">
                {summaryCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="border border-border bg-card/70 p-4">
                      <Icon className="h-4 w-4 text-primary mb-3" />
                      <div className="text-2xl font-display text-primary crt-glow">
                        {card.value}
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
                        {card.label}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2">
                        {card.sub}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="industrial-border p-5 bg-card/85 backdrop-blur scanlines">
                <div className="flex items-center gap-2 border-b border-border pb-2 mb-4 text-xs uppercase tracking-wider text-muted-foreground">
                  <Flame className="h-3 w-3 text-accent" />
                  TODAY&apos;S TOP PICKS
                </div>
                {loading && heroProducts.length === 0 ? (
                  <div className="py-12 text-center text-muted-foreground">
                    Loading market catalog...
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {heroProducts.map((product) => (
                      <Link
                        key={product.id}
                        to={`/product/${product.id}`}
                        className="group flex gap-3 border border-border bg-secondary/20 p-3 transition-colors hover:border-primary"
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden border border-border bg-background">
                          <img
                            src={product.image}
                            alt={product.name}
                            className="h-full w-full object-contain p-1 transition-transform group-hover:scale-105"
                            loading="lazy"
                          />
                        </div>
                        <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {translateCategory(product.category)}
                          </div>
                          <div className="mt-1 line-clamp-2 text-sm font-medium">
                            {product.name}
                          </div>
                          <div className="mt-2 flex items-end justify-between gap-2">
                            <div>
                              {product.discount > 0 && (
                                <div className="text-[10px] line-through text-muted-foreground">
                                  {formatRWF(Math.round(product.price))}
                                </div>
                              )}
                              <div className="text-sm font-semibold text-primary crt-glow">
                                {formatRWF(discountedPrice(product))}
                              </div>
                            </div>
                            {product.discount > 0 && (
                              <span className="tag uppercase text-[10px]">
                                -{product.discount}%
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                {retailFeatures.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="border border-border bg-secondary/30 p-4">
                      <Icon className="h-5 w-5 text-primary mb-3" />
                      <div className="text-sm font-display text-primary">
                        {item.title}
                      </div>
                      <div className="mt-1 text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                        {item.sub}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Truck, title: 'DELIVERY READY', sub: 'Fast Kigali delivery' },
            { icon: Shield, title: 'SAFE PAYMENTS', sub: 'MoMo, Airtel, card, COD' },
            { icon: Clock, title: 'FRESH STOCK', sub: 'Popular items restocked often' },
            { icon: BadgePercent, title: 'DAILY PROMOS', sub: 'Hot deals and special prices' },
          ].map((item) => (
            <div key={item.title} className="flex items-center gap-3 border border-border p-4 bg-secondary/30">
              <item.icon className="h-6 w-6 text-primary shrink-0" />
              <div>
                <div className="text-xs font-display text-primary">{item.title}</div>
                <div className="text-[10px] text-muted-foreground uppercase">{item.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="hot-deals" className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-accent flex items-center gap-2">
              <Flame className="h-3 w-3" /> HOT DEALS
            </div>
            <h2 className="text-3xl font-display text-accent crt-glow">
              TOP SALE PICKS
            </h2>
          </div>
          <Link to="/shop?sale=1" className="terminal-btn text-xs">
            VIEW ALL DEALS
          </Link>
        </div>
        {loading && hotDeals.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            Loading hot deals...
          </div>
        ) : hotDeals.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {hotDeals.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-20 border border-dashed border-border">
            <div className="text-muted-foreground mb-2">No sale items right now.</div>
            <Link to="/shop" className="terminal-btn text-xs">
              BROWSE ALL PRODUCTS
            </Link>
          </div>
        )}
      </section>

      <section id="best-sellers" className="border-y border-border bg-secondary/10">
        <div className="mx-auto max-w-7xl px-4 py-12">
          <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
            <div>
              <div className="text-xs uppercase tracking-widest text-muted-foreground">
                CUSTOMER FAVORITES
              </div>
              <h2 className="text-3xl font-display text-primary crt-glow">
                BEST SELLERS
              </h2>
            </div>
            <Link to="/shop" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
              VIEW ALL PRODUCTS
            </Link>
          </div>
          {loading && bestSellers.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              Loading best sellers...
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              EVERYDAY VALUE
            </div>
            <h2 className="text-3xl font-display text-primary crt-glow">
              VALUE PICKS
            </h2>
          </div>
          <Link to="/shop" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
            SHOP MORE
          </Link>
        </div>
        {loading && valuePicks.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            Loading value picks...
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
              SHOP BY CATEGORY
            </div>
            <h2 className="text-3xl font-display text-primary crt-glow">
              POPULAR AISLES
            </h2>
          </div>
          <Link to="/shop" className="text-xs uppercase tracking-wider text-muted-foreground hover:text-primary">
            EXPLORE ALL
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {categoryStats.map((category) => (
            <Link
              key={category.name}
              to={`/shop?category=${encodeURIComponent(category.name)}`}
              className="card-industrial p-4 text-left group"
            >
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                CATEGORY
              </div>
              <div className="mt-2 text-lg font-display text-primary group-hover:crt-glow">
                {translateCategory(category.name)}
              </div>
              <div className="mt-2 text-xs text-accent">
                [{category.count} items]
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
