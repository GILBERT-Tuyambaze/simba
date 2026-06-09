import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, ShoppingCart, XCircle } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { cancelOrder, type CancelOrderResponse } from '@/lib/checkout';
import { useI18n } from '@/lib/i18n';

function getCancelErrorMessage(
  t: (key: string, fallback?: string) => string,
  error: unknown
): string {
  const raw = error instanceof Error ? error.message : '';
  const lowered = raw.toLowerCase();

  if (lowered.includes('reference') && lowered.includes('order')) {
    return t('auth.paymentCancelledAuto');
  }

  return t('auth.paymentCancelledFailed');
}

export default function PaymentCancelPage() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const orderIdParam = searchParams.get('order_id');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<CancelOrderResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runCancellation() {
      const parsedOrderId = Number(orderIdParam);
      if (!orderIdParam || Number.isNaN(parsedOrderId) || parsedOrderId <= 0) {
        setError(t('auth.paymentCancelledAuto'));
        setLoading(false);
        return;
      }

      try {
        const result = await cancelOrder(parsedOrderId);
        if (!cancelled) {
          setOrder(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(getCancelErrorMessage(t, err));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void runCancellation();

    return () => {
      cancelled = true;
    };
  }, [orderIdParam]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="industrial-border bg-card p-8 md:p-10">
          {loading ? (
            <div className="py-20 text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                {t('auth.redirecting')}
              </p>
            </div>
          ) : error ? (
            <div className="space-y-6 text-center">
              <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground" />
              <h1 className="text-3xl font-display text-primary crt-glow">{t('auth.paymentCancelled')}</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                {t('auth.paymentCancelAlt')}
              </p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/checkout" className="terminal-btn inline-flex items-center gap-2 text-sm">
                  {t('auth.paymentBackToCheckout')} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/account?tab=orders"
                  className="border border-border px-4 py-2 text-xs uppercase tracking-wider hover:border-primary hover:text-primary"
                >
                  {t('auth.paymentToOrders')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="text-center">
                <XCircle className="mx-auto mb-4 h-16 w-16 text-destructive" />
                <h1 className="text-3xl font-display text-primary crt-glow">{t('auth.paymentCancelled')}</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('auth.paymentCancelStripe')}
                </p>
                <p className="mt-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  {t('auth.paymentCancelAlt')}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-border bg-secondary/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('auth.paymentOrderId')}
                  </div>
                  <div className="mt-1 text-lg text-foreground">#{order?.id || orderIdParam || '-'}</div>
                </div>
                <div className="border border-border bg-secondary/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('auth.paymentTracking')}
                  </div>
                  <div className="mt-1 text-lg text-foreground">
                    {order?.tracking_number || t('auth.paymentTracking')}
                  </div>
                </div>
                <div className="border border-border bg-secondary/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('auth.orderStatus')}
                  </div>
                  <div className="mt-1 text-lg text-destructive">
                    {order?.status?.toUpperCase() || t('auth.paymentCancelled')}
                  </div>
                </div>
              </div>

              <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    {t('auth.paymentCancelRetry')}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/checkout" className="terminal-btn inline-flex items-center gap-2 text-sm">
                  {t('auth.paymentBackToCheckout')} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/account?tab=orders"
                  className="border border-border px-4 py-2 text-xs uppercase tracking-wider hover:border-primary hover:text-primary"
                >
                  {t('auth.paymentToOrders')}
                </Link>
                <Link
                  to="/shop"
                  className="border border-border px-4 py-2 text-xs uppercase tracking-wider hover:border-primary hover:text-primary"
                >
                  {t('auth.paymentBackToShop')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <Footer />
    </div>
  );
}
