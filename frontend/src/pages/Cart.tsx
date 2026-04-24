import React from 'react';
import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, Trash2, ShoppingCart, ArrowRight } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useCart } from '@/contexts/CartContext';
import { formatRWF } from '@/lib/types';
import { useProducts } from '@/hooks/useProducts';
import { getAvailableBranchesForProduct } from '@/lib/product-stock';
import { useI18n } from '@/lib/i18n';

const Cart: React.FC = () => {
  const { items, updateQty, syncStockLimit, removeItem, subtotal, branch } = useCart();
  const { products } = useProducts();
  const { t } = useI18n();
  const navigate = useNavigate();

  const shipping = subtotal >= 30000 ? 0 : 2500;
  const total = subtotal + shipping;

  useEffect(() => {
    if (!products.length) {
      return;
    }

    items.forEach((item) => {
      const product = products.find((entry) => entry.id === item.product_id);
      const maxQuantity = product ? getAvailableBranchesForProduct(product).find((entry) => entry.branch === branch)?.stock ?? 0 : 0;
      syncStockLimit(item.product_id, maxQuantity);
    });
  }, [branch, items, products.length, syncStockLimit]);

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <ShoppingCart className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-3xl font-display text-primary crt-glow mb-3">{t('cart.emptyTitle')}</h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t('cart.emptyBody')}
          </p>
          <Link to="/shop" className="terminal-btn inline-flex items-center gap-2 text-sm">
            {t('cart.enterShop')} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-3xl font-display text-primary crt-glow terminal-prompt mb-6">
          {t('cart.title')}
        </h1>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Items */}
          <div className="lg:col-span-2 space-y-3">
            {items.map((item) => (
              <div key={item.product_id} className="industrial-border flex flex-wrap items-center gap-4 bg-card p-4">
                <Link to={`/product/${item.product_id}`} className="w-20 h-20 shrink-0 bg-secondary/50 border border-border overflow-hidden">
                  <img src={item.image} alt={item.product_name} className="w-full h-full object-contain" />
                </Link>
                <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                  <Link to={`/product/${item.product_id}`} className="text-sm font-medium line-clamp-2 hover:text-primary">
                    {item.product_name}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-1">
                    {t('cart.skuLine', { values: { sku: item.product_id, price: formatRWF(item.price), unit: item.unit || 'Pcs' } })}
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {item.branch
                      ? t('cart.availableAt', { values: { branch: item.branch } })
                      : t('cart.availableSelectedBranch')}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(() => {
                      const product = products.find((entry) => entry.id === item.product_id);
                      const branches = product ? getAvailableBranchesForProduct(product) : [];
                      return branches.slice(0, 3).map((branchInfo) => (
                        <span key={`${item.product_id}-${branchInfo.branch}`} className="tag text-[10px] uppercase">
                          {branchInfo.branch} x{branchInfo.stock}
                        </span>
                      ));
                    })()}
                  </div>
                </div>
                <div className="flex items-center border border-border">
                  <button
                    onClick={() => updateQty(item.product_id, item.quantity - 1)}
                    className="p-1 hover:bg-secondary"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-10 text-center text-sm font-mono">{item.quantity}</span>
                  <button
                    onClick={() => updateQty(item.product_id, item.quantity + 1)}
                    disabled={typeof item.max_quantity === 'number' && item.quantity >= item.max_quantity}
                    className="p-1 hover:bg-secondary disabled:opacity-40"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
                <div className="w-auto shrink-0 text-right sm:w-24">
                  <div className="text-primary font-semibold">
                    {formatRWF(item.price * item.quantity)}
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('cart.stockValue', { values: { stock: typeof item.max_quantity === 'number' ? item.max_quantity : '-' } })}
                  </div>
                </div>
                <button
                  onClick={() => removeItem(item.product_id)}
                  className="p-2 text-muted-foreground hover:text-destructive"
                  aria-label={t('cart.remove')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            <Link to="/shop" className="inline-block text-xs text-muted-foreground hover:text-primary mt-4">
              {t('cart.continueShopping')}
            </Link>
          </div>

          {/* Summary */}
          <div className="lg:col-span-1">
            <div className="industrial-border bg-card p-6 lg:sticky lg:top-32">
              <h3 className="text-lg font-display text-primary mb-4 border-b border-border pb-2">
                {t('cart.orderSummary')}
              </h3>
              <div className="space-y-2 mb-4">
                <div className="data-row"><span className="label">{t('cart.branch')}</span><span className="value">{branch}</span></div>
                <div className="data-row"><span className="label">{t('cart.items')}</span><span className="value">{items.length}</span></div>
                <div className="data-row"><span className="label">{t('cart.subtotal')}</span><span className="value">{formatRWF(subtotal)}</span></div>
                <div className="data-row">
                  <span className="label">{t('cart.shipping')}</span>
                  <span className="value">{shipping === 0 ? <span className="text-accent">{t('cart.free')}</span> : formatRWF(shipping)}</span>
                </div>
              </div>
              {shipping > 0 && (
                <div className="text-[10px] text-muted-foreground mb-4 p-2 border border-dashed border-border">
                  {t('cart.freeDeliveryHint', { values: { amount: formatRWF(30000 - subtotal) } })}
                </div>
              )}
              <div className="border-t border-border pt-3 mb-4">
                <div className="flex justify-between items-baseline">
                  <span className="text-sm uppercase">{t('cart.total')}</span>
                  <span className="text-2xl font-display text-primary crt-glow">{formatRWF(total)}</span>
                </div>
              </div>
              <button
                onClick={() => navigate('/checkout')}
                className="w-full terminal-btn text-sm flex items-center justify-center gap-2"
              >
                {t('cart.proceed')} <ArrowRight className="h-4 w-4" />
              </button>
              <div className="text-[10px] text-muted-foreground text-center mt-3">
                {t('cart.securePayment')}
              </div>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Cart;
