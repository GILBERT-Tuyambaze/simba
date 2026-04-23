import React, { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Filter, Grid, List, X } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import ProductCard from '@/components/products/ProductCard';
import { useProducts } from '@/hooks/useProducts';
import { useI18n } from '@/lib/i18n';
import {
  buildLocalConversationalMatches,
  buildLocalConversationalResult,
  runConversationalSearch,
  type ConversationalSearchResult,
} from '@/lib/conversational-search';

const Shop: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { products, loading } = useProducts();
  const { t, translateCategory } = useI18n();

  const [category, setCategory] = useState<string>(params.get('category') || '');
  const [query, setQuery] = useState<string>(params.get('q') || '');
  const [brand, setBrand] = useState<string>('');
  const [priceMax, setPriceMax] = useState<number>(300000);
  const [saleOnly, setSaleOnly] = useState<boolean>(params.get('sale') === '1');
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [sort, setSort] = useState<string>('popular');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [aiResult, setAiResult] = useState<ConversationalSearchResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    setCategory(params.get('category') || '');
    setQuery(params.get('q') || '');
    setSaleOnly(params.get('sale') === '1');
  }, [params]);

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      if (!query.trim() || products.length === 0) {
        setAiResult(null);
        setAiLoading(false);
        return;
      }

      setAiResult(buildLocalConversationalResult(query, products));
      setAiLoading(true);
      const result = await runConversationalSearch(query, products);
      if (!cancelled) {
        setAiResult(result);
        setAiLoading(false);
      }
    }

    void loadConversation();
    return () => {
      cancelled = true;
    };
  }, [products, query, t]);

  const categories = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.category))).sort();
  }, [products]);

  const brands = useMemo(() => {
    return Array.from(new Set(products.map((p) => p.brand))).sort();
  }, [products]);

  const conversationalBase = useMemo(() => {
    if (!query.trim()) {
      return products;
    }

    if (aiResult?.products.length) {
      return aiResult.products;
    }

    return buildLocalConversationalMatches(query, products);
  }, [aiResult, products, query]);

  const filtered = useMemo(() => {
    let list = [...conversationalBase];
    if (category) list = list.filter((p) => p.category === category);
    if (brand) list = list.filter((p) => p.brand === brand);
    list = list.filter((p) => p.price <= priceMax);
    if (saleOnly) list = list.filter((p) => p.discount > 0);
    if (inStockOnly) list = list.filter((p) => p.in_stock);

    switch (sort) {
      case 'price-asc': list.sort((a, b) => a.price - b.price); break;
      case 'price-desc': list.sort((a, b) => b.price - a.price); break;
      case 'rating': list.sort((a, b) => b.rating - a.rating); break;
      case 'discount': list.sort((a, b) => b.discount - a.discount); break;
      default: list.sort((a, b) => b.rating * 10 + b.discount - (a.rating * 10 + a.discount));
    }
    return list;
  }, [conversationalBase, category, brand, priceMax, saleOnly, inStockOnly, sort]);

  const clearFilters = () => {
    setCategory('');
    setBrand('');
    setQuery('');
    setPriceMax(300000);
    setSaleOnly(false);
    setInStockOnly(false);
    setParams({});
  };

  const FilterPanel = (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase text-muted-foreground mb-2 flex items-center justify-between">
          {t('shop.category')}
          {category && (
            <button onClick={() => setCategory('')} className="text-accent">{t('shop.clear')}</button>
          )}
        </div>
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c === category ? '' : c)}
              className={`w-full text-left text-xs px-2 py-1.5 border transition-colors ${
                category === c
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:border-primary/50'
              }`}
            >
              {translateCategory(c)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase text-muted-foreground mb-2">{t('shop.brand')}</div>
        <select
          value={brand}
          onChange={(e) => setBrand(e.target.value)}
          className="w-full border border-border bg-input p-2 font-mono text-xs"
        >
          <option value="">{t('shop.allBrands')}</option>
          {brands.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      </div>

      <div>
        <div className="text-xs uppercase text-muted-foreground mb-2">
          MAX PRICE: <span className="text-primary">RWF {priceMax.toLocaleString()}</span>
        </div>
        <input
          type="range"
          min={1000}
          max={300000}
          step={1000}
          value={priceMax}
          onChange={(e) => setPriceMax(parseInt(e.target.value))}
          className="w-full accent-primary"
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={saleOnly} onChange={(e) => setSaleOnly(e.target.checked)} className="accent-primary" />
          <span>{t('shop.onSaleOnly')}</span>
        </label>
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" checked={inStockOnly} onChange={(e) => setInStockOnly(e.target.checked)} className="accent-primary" />
          <span>{t('shop.inStockOnly')}</span>
        </label>
      </div>

      <button onClick={clearFilters} className="w-full terminal-btn text-xs">
        {t('shop.resetAll')}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-7xl px-4 py-8">
        {/* Title bar */}
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground">{t('shop.catalogPath')}</div>
            <h1 className="text-3xl font-display text-primary crt-glow terminal-prompt">
              {category ? translateCategory(category) : t('shop.title.all')}
            </h1>
            {query && (
              <div className="text-xs text-muted-foreground mt-1">
                {t('shop.searchLabel')}: <span className="text-primary">&quot;{query}&quot;</span>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            [{filtered.length}] {t('shop.itemsFound')}
          </div>
        </div>

        <div className="flex gap-6">
          {/* Desktop filters */}
          <aside className="hidden lg:block w-60 shrink-0">
            <div className="sticky top-32 border border-border bg-card/40 p-4">
              <div className="text-sm font-display text-primary mb-4 flex items-center gap-2 border-b border-border pb-2">
                <Filter className="h-3 w-3" /> {t('shop.filters')}
              </div>
              {FilterPanel}
            </div>
          </aside>

          {/* Main */}
          <main className="flex-1 min-w-0">
            {/* Controls */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <button
                onClick={() => setMobileFilterOpen(true)}
                className="lg:hidden terminal-btn text-xs flex items-center gap-1"
              >
                <Filter className="h-3 w-3" /> {t('shop.filters')}
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="border border-border bg-input px-2 py-2 font-mono text-xs"
              >
                <option value="popular">{t('shop.popular')}</option>
                <option value="price-asc">{t('shop.priceLowHigh')}</option>
                <option value="price-desc">{t('shop.priceHighLow')}</option>
                <option value="rating">{t('shop.topRated')}</option>
                <option value="discount">{t('shop.bestDeals')}</option>
              </select>
              <div className="ml-auto flex border border-border">
                <button
                  onClick={() => setView('grid')}
                  className={`p-2 ${view === 'grid' ? 'bg-primary text-primary-foreground' : ''}`}
                  aria-label={t('shop.gridView')}
                >
                  <Grid className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`p-2 ${view === 'list' ? 'bg-primary text-primary-foreground' : ''}`}
                  aria-label={t('shop.listView')}
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>

            {query && (
              <div className="mb-4 border border-primary/30 bg-primary/10 p-4">
                <div className="text-[10px] uppercase tracking-[0.24em] text-primary">
                  {t('shop.aiHeading')}
                </div>
                <div className="mt-2 text-sm text-foreground">
                  {aiLoading ? t('shop.thinking') : aiResult?.message || t('shop.aiFallback')}
                </div>
              </div>
            )}

            {/* Grid */}
            {loading ? (
              <div className="text-center py-20 text-muted-foreground">{t('shop.loading')}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 border border-dashed border-border">
                <div className="text-muted-foreground mb-2">&gt; {t('shop.empty')}</div>
                <button onClick={clearFilters} className="terminal-btn text-xs">{t('shop.clear')}</button>
              </div>
            ) : (
              <div className={view === 'grid'
                ? 'grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4'
                : 'space-y-3'
              }>
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} variant={view} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Mobile filter sheet */}
      {mobileFilterOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-background/80">
          <div className="absolute right-0 top-0 bottom-0 w-80 max-w-full bg-card border-l border-border overflow-y-auto p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm font-display text-primary">{t('shop.filters')}</div>
              <button onClick={() => setMobileFilterOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            {FilterPanel}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default Shop;
