import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Package, ShoppingCart } from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useCart } from '@/contexts/CartContext';
import { verifyPaymentSession, type VerifyPaymentResponse } from '@/lib/checkout';
import { formatRWF } from '@/lib/types';
import { useI18n } from '@/lib/i18n';

function getPaymentErrorMessage(
  t: (key: string, fallback?: string) => string,
  error: unknown,
  fallbackKey: string
): string {
  const raw = error instanceof Error ? error.message : '';
  const lowered = raw.toLowerCase();

  if (lowered.includes('session') && lowered.includes('missing')) {
    return t('auth.paymentMissingSession');
  }

  if (lowered.includes('confirmed') || lowered.includes('verification')) {
    return t(fallbackKey);
  }

  return t(fallbackKey);
}

export default function PaymentSuccessPage() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
  const sessionId = searchParams.get('session_id');
  const { clear } = useCart();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [details, setDetails] = useState<VerifyPaymentResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function runVerification() {
      if (!sessionId) {
        setError(t('auth.paymentMissingSession'));
        setLoading(false);
        return;
      }

      try {
        const result = await verifyPaymentSession(sessionId);
        if (cancelled) {
          return;
        }

        setDetails(result);
        if (result.payment_status === 'paid' || result.status === 'processing') {
          clear();
        } else {
          setError(t('auth.paymentNotConfirmed'));
        }
      } catch (err) {
        if (!cancelled) {
          setError(getPaymentErrorMessage(t, err, 'auth.paymentVerifyFailed'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void runVerification();

    return () => {
      cancelled = true;
    };
  }, [clear, sessionId]);

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="industrial-border bg-card p-8 md:p-10">
          {loading ? (
            <div className="py-20 text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-primary" />
              <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
                {t('auth.paymentVerifying')}
              </p>
            </div>
          ) : error ? (
            <div className="space-y-6 text-center">
              <ShoppingCart className="mx-auto h-16 w-16 text-muted-foreground" />
              <h1 className="text-3xl font-display text-primary crt-glow">
                {t('auth.paymentError')}
              </h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/checkout" className="terminal-btn inline-flex items-center gap-2 text-sm">
                  {t('auth.paymentBackToCheckout')} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/account?tab=orders" className="border border-border px-4 py-2 text-xs uppercase tracking-wider hover:border-primary hover:text-primary">
                  {t('auth.paymentToOrders')}
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <div className="text-center">
                <CheckCircle2 className="mx-auto mb-4 h-16 w-16 text-primary" />
                <h1 className="text-3xl font-display text-primary crt-glow">
                  {t('auth.paymentVerified')}
                </h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  {t('auth.paymentConfirmedBody')}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="border border-border bg-secondary/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('auth.paymentOrderId')}
                  </div>
                  <div className="mt-1 text-lg text-foreground">#{details?.order_id}</div>
                </div>
                <div className="border border-border bg-secondary/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('auth.paymentTracking')}
                  </div>
                  <div className="mt-1 text-lg text-foreground">{details?.tracking_number}</div>
                </div>
                <div className="border border-border bg-secondary/20 p-4">
                  <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {t('auth.paymentTotal')}
                  </div>
                  <div className="mt-1 text-lg text-primary">{formatRWF(details?.total || 0)}</div>
                </div>
              </div>

              <div className="border border-dashed border-border p-4 text-sm text-muted-foreground">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    {t('auth.paymentStatus')}: <span className="text-primary">{details?.payment_status}</span>
                  </p>
                </div>
                <div className="mt-2 flex items-start gap-3">
                  <Package className="mt-0.5 h-4 w-4 text-primary" />
                  <p>
                    {t('auth.orderStatus')}: <span className="text-primary">{details?.status}</span>
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap justify-center gap-3">
                <Link to="/account?tab=orders" className="terminal-btn inline-flex items-center gap-2 text-sm">
                  {t('auth.paymentToOrders')} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to="/shop" className="border border-border px-4 py-2 text-xs uppercase tracking-wider hover:border-primary hover:text-primary">
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
