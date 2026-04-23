import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingCart, Search, User, MapPin, Menu, X, Terminal, Shield } from 'lucide-react';
import { useCart } from '@/contexts/CartContext';
import { useAuth } from '@/contexts/AuthContext';
import { BRANCHES, getBranchDetails } from '@/lib/types';
import { fetchBranchReviewSummaries } from '@/lib/branch-reviews';
import { useI18n } from '@/lib/i18n';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';

const BRAND_TITLE = import.meta.env.VITE_APP_TITLE?.trim() || 'Simba Supermarket';
const BRAND_LOGO_URL = '/android-chrome-192x192.png';

const Header: React.FC = () => {
  const { totalItems, branch, setBranch } = useCart();
  const { user, login, logout, isAdmin } = useAuth();
  const { language, setLanguage, suggestedLanguage, dismissSuggestedLanguage, t } = useI18n();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [branchRatings, setBranchRatings] = useState<Record<string, { rating: number; reviewCount: number }>>({});
  const branchDetails = getBranchDetails(branch);

  useEffect(() => {
    let cancelled = false;

    fetchBranchReviewSummaries()
      .then((items) => {
        if (cancelled) {
          return;
        }

        const next = Object.fromEntries(
          items.map((item) => [
            item.branch,
            { rating: item.rating, reviewCount: item.review_count },
          ])
        );
        setBranchRatings(next);
      })
      .catch(() => {
        if (!cancelled) {
          setBranchRatings({});
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/shop?q=${encodeURIComponent(search.trim())}`);
      setSearch('');
      setMobileOpen(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      {suggestedLanguage && (
        <div className="border-b border-primary/30 bg-primary/10">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2 text-xs">
            <span className="text-primary">
              {suggestedLanguage === 'rw'
                ? 'We detected Rwanda/Kinyarwanda settings. Switch the site to Kinyarwanda?'
                : 'We detected French settings. Switch the site to French?'}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLanguage(suggestedLanguage);
                  dismissSuggestedLanguage();
                }}
                className="border border-primary px-2 py-1 uppercase tracking-[0.2em] text-primary"
              >
                Use {suggestedLanguage.toUpperCase()}
              </button>
              <button
                type="button"
                onClick={dismissSuggestedLanguage}
                className="border border-border px-2 py-1 uppercase tracking-[0.2em] text-muted-foreground"
              >
                Keep {language.toUpperCase()}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top strip */}
      <div className="border-b border-border/50 bg-secondary/40">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-1 text-xs text-muted-foreground">
          <span className="crt-glow flex items-center gap-2">
            <Terminal className="h-3 w-3" />
            {t('header.topline')}
          </span>
          <div className="hidden items-center gap-3 md:flex">
            <span>{t('header.freeDelivery')}</span>
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'en' | 'rw' | 'fr')}
              className="border border-border bg-background px-2 py-1 text-[10px] uppercase tracking-[0.2em]"
              aria-label="language"
            >
              <option value="en">EN</option>
              <option value="rw">RW</option>
              <option value="fr">FR</option>
            </select>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <img
            src={BRAND_LOGO_URL}
            alt={BRAND_TITLE}
            className="h-10 w-10 border border-primary bg-black object-contain crt-glow-strong"
          />
          <div className="hidden sm:block">
            <div className="font-display text-2xl leading-none text-primary crt-glow">
              SIMBA
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              SUPERMARKET // EST.2026
            </div>
          </div>
        </Link>

        {/* Branch selector */}
        <DropdownMenu>
          <DropdownMenuTrigger className="hidden md:flex items-center gap-2 border border-border bg-secondary/40 px-3 py-2 text-xs uppercase tracking-wider hover:border-primary">
            <MapPin className="h-4 w-4 text-primary" />
            <div className="text-left">
              <div className="text-[9px] text-muted-foreground">{t('header.branch')}</div>
              <div>{branchDetails?.shortAddress || branch}</div>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="font-mono">
            <DropdownMenuLabel>{t('header.selectBranch')}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {BRANCHES.map((b) => {
              const details = getBranchDetails(b);
              const live = branchRatings[b];
              const rating = live?.rating ?? details?.rating ?? 0;
              const reviewCount = live?.reviewCount ?? details?.reviewCount ?? 0;

              return (
                <DropdownMenuItem key={b} onSelect={() => setBranch(b)}>
                  <div>
                    <div>{b}</div>
                    <div className="text-[10px] text-muted-foreground">{details?.shortAddress}</div>
                    <div className="text-[10px] text-accent">
                      {rating.toFixed(1)}★ · {reviewCount} {t('header.branchReviews')}
                    </div>
                  </div>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative hidden flex-1 md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('header.search')}
            className="w-full border border-border bg-input py-2 pl-9 pr-4 font-mono text-sm placeholder:text-muted-foreground/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </form>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* Account */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 border border-border px-3 py-2 text-xs uppercase tracking-wider hover:border-primary"
                aria-label="account menu"
              >
                <User className="h-4 w-4 text-primary" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="font-mono">
                <DropdownMenuLabel>{t('header.account')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => navigate('/account')}>
                  {t('header.account')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/account?tab=orders')}>
                  {t('header.orderHistory')}
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onSelect={() => navigate('/admin/overview')}>
                    <Shield className="h-3 w-3 mr-2" /> {t('header.dashboard')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => logout()}>
                  {t('header.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              onClick={() => login()}
              className="terminal-btn hidden sm:flex items-center gap-2 text-xs"
            >
              <User className="h-4 w-4" />
              {t('header.login')}
            </button>
          )}

          {/* Cart */}
          <Link
            to="/cart"
            className="relative flex items-center gap-2 border border-primary/50 bg-primary/10 px-3 py-2 text-xs uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-all"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">{t('header.cart')}</span>
            {totalItems > 0 && (
              <span className="absolute -right-2 -top-2 flex h-5 min-w-[20px] items-center justify-center border border-primary bg-background px-1 text-[10px] text-primary crt-glow">
                {totalItems}
              </span>
            )}
          </Link>

          {/* Mobile menu */}
          <button
            className="md:hidden border border-border p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="menu"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Nav */}
      <nav className="hidden md:block border-t border-border/50 bg-secondary/20">
        <div className="mx-auto flex max-w-7xl items-center gap-6 px-4 py-2 text-xs uppercase tracking-wider">
          <Link to="/" className="hover:text-primary transition-colors">{t('nav.home')}</Link>
          <Link to="/shop" className="hover:text-primary transition-colors">{t('nav.shop')}</Link>
          <Link to="/shop?category=Food Products" className="hover:text-primary transition-colors">{t('nav.food')}</Link>
          <Link to="/shop?category=Baby Products" className="hover:text-primary transition-colors">{t('nav.baby')}</Link>
          <Link to="/shop?category=Alcoholic Drinks" className="hover:text-primary transition-colors">{t('nav.beverages')}</Link>
          <Link to="/shop?category=Kitchenware %26 Electronics" className="hover:text-primary transition-colors">{t('nav.kitchen')}</Link>
          <Link to="/shop?category=Cleaning %26 Sanitary" className="hover:text-primary transition-colors">{t('nav.cleaning')}</Link>
          <Link to="/shop?sale=1" className="text-accent hover:text-accent/80 transition-colors">{t('nav.promos')}</Link>
        </div>
      </nav>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background p-4 space-y-3">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('header.search')}
              className="w-full border border-border bg-input py-2 pl-9 pr-4 font-mono text-sm"
            />
          </form>
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            className="w-full border border-border bg-input p-2 font-mono text-sm"
          >
            {BRANCHES.map((b) => {
              const details = getBranchDetails(b);
              const live = branchRatings[b];
              const rating = live?.rating ?? details?.rating ?? 0;
              return (
                <option key={b} value={b}>
                  {b}
                  {details ? ` (${rating.toFixed(1)}★)` : ''}
                </option>
              );
            })}
          </select>
          <div className="grid grid-cols-2 gap-2 text-xs uppercase">
            <Link to="/" onClick={() => setMobileOpen(false)} className="border border-border p-2">{t('nav.home')}</Link>
            <Link to="/shop" onClick={() => setMobileOpen(false)} className="border border-border p-2">{t('nav.shop')}</Link>
            <Link to="/cart" onClick={() => setMobileOpen(false)} className="border border-border p-2">{t('header.cart')}</Link>
            <Link to="/account" onClick={() => setMobileOpen(false)} className="border border-border p-2">{t('header.account')}</Link>
          </div>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'en' | 'rw' | 'fr')}
            className="w-full border border-border bg-input p-2 font-mono text-sm"
          >
            <option value="en">English</option>
            <option value="rw">Kinyarwanda</option>
            <option value="fr">Francais</option>
          </select>
          {!user && (
            <button onClick={() => login()} className="terminal-btn w-full text-xs">{t('header.login')}</button>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
