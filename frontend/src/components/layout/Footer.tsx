import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Terminal, Mail, Phone, MapPin, Github, Twitter, Facebook, Instagram } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

const BRAND_TITLE = import.meta.env.VITE_APP_TITLE?.trim() || 'Simba Supermarket';
const BRAND_LOGO_URL = '/android-chrome-192x192.png';

const Footer: React.FC = () => {
  const [email, setEmail] = useState('');
  const { t } = useI18n();

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email.includes('@')) {
      toast.success(t('footer.subscribeSuccess'));
      setEmail('');
    } else {
      toast.error(t('footer.subscribeInvalid'));
    }
  };

  return (
    <footer className="border-t border-border bg-secondary/30 mt-20">
      {/* Newsletter */}
      <div className="border-b border-border">
        <div className="mx-auto max-w-7xl px-4 py-10 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <h3 className="text-2xl font-display text-primary crt-glow">
              {t('footer.newsletter.title')}
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('footer.newsletter.body')}
            </p>
          </div>
          <form onSubmit={handleSubscribe} className="flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('footer.newsletter.placeholder')}
              className="flex-1 border border-border bg-input px-3 py-2 font-mono text-sm focus:border-primary focus:outline-none"
            />
            <button type="submit" className="terminal-btn text-xs">
              {t('footer.subscribe')}
            </button>
          </form>
        </div>
      </div>

      {/* Main grid */}
      <div className="mx-auto max-w-7xl px-4 py-12 grid gap-8 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <img
              src={BRAND_LOGO_URL}
              alt={BRAND_TITLE}
              className="h-10 w-10 border border-primary bg-black object-contain crt-glow-strong"
            />
            <div>
              <div className="font-display text-xl text-primary crt-glow">SIMBA</div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{t('footer.brandLine')}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('footer.about')}
          </p>
          <div className="flex gap-2 mt-4">
            <a href="#" className="border border-border p-2 hover:border-primary hover:text-primary" aria-label="twitter"><Twitter className="h-3 w-3" /></a>
            <a href="#" className="border border-border p-2 hover:border-primary hover:text-primary" aria-label="facebook"><Facebook className="h-3 w-3" /></a>
            <a href="#" className="border border-border p-2 hover:border-primary hover:text-primary" aria-label="instagram"><Instagram className="h-3 w-3" /></a>
            <a href="#" className="border border-border p-2 hover:border-primary hover:text-primary" aria-label="github"><Github className="h-3 w-3" /></a>
          </div>
        </div>

        <div>
          <h4 className="text-sm font-display text-primary mb-4 flex items-center gap-2">
            <Terminal className="h-3 w-3" /> {t('footer.shop')}
          </h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li><Link to="/shop" className="hover:text-primary">{t('footer.allProducts')}</Link></li>
            <li><Link to="/#best-sellers" className="hover:text-primary">{t('footer.bestSellers')}</Link></li>
            <li><Link to="/shop?category=Food Products" className="hover:text-primary">{t('footer.foodProducts')}</Link></li>
            <li><Link to="/shop?category=Baby Products" className="hover:text-primary">{t('footer.babyProducts')}</Link></li>
            <li><Link to="/shop?category=Alcoholic Drinks" className="hover:text-primary">{t('footer.beverages')}</Link></li>
            <li><Link to="/#hot-deals" className="hover:text-primary text-accent">{t('footer.deals')}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-display text-primary mb-4 flex items-center gap-2">
            <Terminal className="h-3 w-3" /> {t('footer.support')}
          </h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li><Link to="/account" className="hover:text-primary">{t('footer.myAccount')}</Link></li>
            <li><Link to="/account?tab=orders" className="hover:text-primary">{t('footer.orderTracking')}</Link></li>
            <li><Link to="/support#shipping-policy" className="hover:text-primary">{t('footer.shippingPolicy')}</Link></li>
            <li><Link to="/support#returns-refunds" className="hover:text-primary">{t('footer.returns')}</Link></li>
            <li><Link to="/support#faq" className="hover:text-primary">{t('footer.faq')}</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-display text-primary mb-4 flex items-center gap-2">
            <Terminal className="h-3 w-3" /> {t('footer.contact')}
          </h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex gap-2"><MapPin className="h-3 w-3 mt-0.5 text-primary" /> {t('footer.address')}</li>
            <li className="flex gap-2"><Phone className="h-3 w-3 mt-0.5 text-primary" /> {t('footer.phone')}</li>
            <li className="flex gap-2"><Mail className="h-3 w-3 mt-0.5 text-primary" /> {t('footer.email')}</li>
            <li className="pt-2">
              <span className="tag">{t('footer.openHours')}</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-border bg-background/50">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-muted-foreground md:flex-row">
          <div>{t('footer.copyright')}</div>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <a
              href="https://tuyambaze-gilbert.vercel.app/"
              target="_blank"
              rel="noreferrer"
              className="hover:text-primary"
            >
              {t('footer.developerCredit')}
            </a>
            <Link to="/legal#privacy" className="hover:text-primary">{t('footer.privacy')}</Link>
            <Link to="/legal#terms" className="hover:text-primary">{t('footer.terms')}</Link>
            <Link to="/legal#cookies" className="hover:text-primary">{t('footer.cookies')}</Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
