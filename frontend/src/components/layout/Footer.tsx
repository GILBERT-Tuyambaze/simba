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
      toast.success('> subscribed. welcome to the grid.');
      setEmail('');
    } else {
      toast.error('Invalid transmission address');
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
          <form onSubmit={handleSubscribe} className="flex gap-2">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="> your.email@domain"
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
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">SUPERMARKET</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Kigali&apos;s favorite supermarket chain. 4 branches, 10,000+ products, 
            daily deliveries across Rwanda. Quality you can trust since 2026.
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
            <Terminal className="h-3 w-3" /> SHOP
          </h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li><Link to="/shop" className="hover:text-primary">All Products</Link></li>
            <li><Link to="/shop?category=Food Products" className="hover:text-primary">Food Products</Link></li>
            <li><Link to="/shop?category=Baby Products" className="hover:text-primary">Baby Products</Link></li>
            <li><Link to="/shop?category=Alcoholic Drinks" className="hover:text-primary">Beverages</Link></li>
            <li><Link to="/shop?sale=1" className="hover:text-primary text-accent">Deals & Offers</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-display text-primary mb-4 flex items-center gap-2">
            <Terminal className="h-3 w-3" /> SUPPORT
          </h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li><Link to="/account" className="hover:text-primary">My Account</Link></li>
            <li><Link to="/account?tab=orders" className="hover:text-primary">Order Tracking</Link></li>
            <li><a href="#" className="hover:text-primary">Shipping Policy</a></li>
            <li><a href="#" className="hover:text-primary">Returns & Refunds</a></li>
            <li><a href="#" className="hover:text-primary">FAQ</a></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-display text-primary mb-4 flex items-center gap-2">
            <Terminal className="h-3 w-3" /> CONTACT
          </h4>
          <ul className="space-y-2 text-xs text-muted-foreground">
            <li className="flex gap-2"><MapPin className="h-3 w-3 mt-0.5 text-primary" /> KN 4 Ave, Kigali, Rwanda</li>
            <li className="flex gap-2"><Phone className="h-3 w-3 mt-0.5 text-primary" /> +250 788 000 000</li>
            <li className="flex gap-2"><Mail className="h-3 w-3 mt-0.5 text-primary" /> help@simbasupermarket.rw</li>
            <li className="pt-2">
              <span className="tag">OPEN 07:00 - 22:00</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Bottom */}
      <div className="border-t border-border bg-background/50">
        <div className="mx-auto max-w-7xl px-4 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <div>&copy; 2026 SIMBA SUPERMARKET // ALL RIGHTS RESERVED</div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-primary">Privacy</a>
            <a href="#" className="hover:text-primary">Terms</a>
            <a href="#" className="hover:text-primary">Cookies</a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
