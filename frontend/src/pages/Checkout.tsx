import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CreditCard,
  MapPin,
  Package,
  Phone,
  ShoppingCart,
  Truck,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useAuth } from '@/contexts/AuthContext';
import { useCart } from '@/contexts/CartContext';
import { useProducts } from '@/hooks/useProducts';
import { fetchAccountProfile, saveAccountProfile } from '@/lib/account';
import {
  createPaymentSession,
  type CheckoutPaymentMethod,
} from '@/lib/checkout';
import { fetchBranchDirectory } from '@/lib/directory';
import { fetchBranchReviewSummaries } from '@/lib/branch-reviews';
import { getProductStockForBranch } from '@/lib/product-stock';
import { BRANCHES, formatRWF, getBranchDetails, type UserProfile } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

type FieldErrors = {
  name?: string;
  phone?: string;
  address?: string;
  promo?: string;
  payment?: string;
  delivery_option?: string;
};

const FREE_SHIPPING_THRESHOLD = 30000;
const BASE_SHIPPING = 2500;
const PROMO_CODE = 'SIMBA2K';
const PROMO_DISCOUNT = 2000;
const PROMO_MIN_SPEND = 15000;
const PICKUP_DEPOSIT = 500;
const FLEX_PICKUP_DEPOSIT = 2000;
const FLEX_PICKUP_WINDOW = 'Today, +3 hrs';
const ORDER_HISTORY_PATH = '/account?tab=orders';
const STRIPE_CANCEL_PATH = '/payment-cancel';

function getPaymentMethodLabel(method: CheckoutPaymentMethod): string {
  switch (method) {
    case 'mtn_momo':
      return 'MTN MoMo';
    case 'airtel_money':
      return 'Airtel Money';
    case 'card':
      return 'Stripe Card';
    case 'cash_on_delivery':
      return 'Cash on Delivery';
    default:
      return method;
  }
}

function getPaymentActionLabel(method: CheckoutPaymentMethod, total: number): string {
  switch (method) {
    case 'card':
      return `CONTINUE TO STRIPE - ${formatRWF(total)}`;
    case 'mtn_momo':
      return `PLACE MTN MOMO ORDER - ${formatRWF(total)}`;
    case 'airtel_money':
      return `PLACE AIRTEL MONEY ORDER - ${formatRWF(total)}`;
    case 'cash_on_delivery':
      return `PLACE ORDER - ${formatRWF(total)}`;
    default:
      return `PLACE ORDER - ${formatRWF(total)}`;
  }
}

const PAYMENT_OPTIONS: Array<{
  value: CheckoutPaymentMethod;
  title: string;
  description: string;
  note: string;
  badge: string;
  icon: typeof CreditCard;
}> = [
  {
    value: 'mtn_momo',
    title: 'MTN MoMo',
    description: 'Primary mobile money checkout.',
    note: 'Recommended for fast local payment.',
    badge: 'PRIMARY',
    icon: Phone,
  },
  {
    value: 'airtel_money',
    title: 'Airtel Money',
    description: 'Primary Airtel money checkout.',
    note: 'Recommended for fast local payment.',
    badge: 'PRIMARY',
    icon: Phone,
  },
  {
    value: 'card',
    title: 'Stripe Card',
    description: 'Secure hosted card checkout powered by Stripe.',
    note: 'You will be redirected to Stripe after review.',
    badge: 'CARD',
    icon: CreditCard,
  },
  {
    value: 'cash_on_delivery',
    title: 'Cash on Delivery',
    description: 'Pay when your order arrives.',
    note: 'No extra payment step required.',
    badge: 'COD',
    icon: Truck,
  },
];

function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase();
}

function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, '').trim();
}

function validatePhone(value: string): string | null {
  const normalized = normalizePhone(value);
  if (!normalized) {
    return 'Enter a phone number.';
  }

  if (!/^\+?[0-9]{9,15}$/.test(normalized)) {
    return 'Enter a valid phone number.';
  }

  return null;
}

function validateAddress(value: string, deliveryMethod: 'delivery' | 'pickup'): string | null {
  if (deliveryMethod === 'pickup') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return 'Enter a delivery address.';
  }

  if (trimmed.length < 12) {
    return 'Use a fuller delivery address with street and area details.';
  }

  if (trimmed.split(/\s+/).length < 2) {
    return 'Delivery address is too short.';
  }

  return null;
}

function getPromoDiscount(code: string, subtotal: number): { discount: number; error: string | null } {
  const normalized = normalizePromoCode(code);
  if (!normalized) {
    return { discount: 0, error: null };
  }

  if (normalized !== PROMO_CODE) {
    return {
      discount: 0,
      error: `Invalid promo code. Use ${PROMO_CODE} for the checkout discount.`,
    };
  }

  if (subtotal < PROMO_MIN_SPEND) {
    return {
      discount: 0,
      error: `Promo code ${PROMO_CODE} requires a minimum spend of RWF ${PROMO_MIN_SPEND.toLocaleString('en-US')}.`,
    };
  }

  return { discount: PROMO_DISCOUNT, error: null };
}

function normalizeStoredPaymentMethod(value: string | null | undefined): CheckoutPaymentMethod {
  switch ((value || '').trim().toLowerCase()) {
    case 'mobile_money':
    case 'mtn':
    case 'mtn_momo':
      return 'mtn_momo';
    case 'airtel':
    case 'airtel_money':
      return 'airtel_money';
    case 'cash_on_delivery':
    case 'cod':
      return 'cash_on_delivery';
    case 'card':
    default:
      return 'mtn_momo';
  }
}

export default function CheckoutPage() {
  const { user, loading } = useAuth();
  const { items, subtotal, branch, setBranch, syncStockLimit, clear } = useCart();
  const { products } = useProducts();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState<'delivery' | 'pickup'>('pickup');
  const [deliveryOption, setDeliveryOption] = useState<'delivery_by_branch' | 'delivery_by_delivery_guy' | 'self_pickup'>('self_pickup');
  const [deliveryAgentId, setDeliveryAgentId] = useState('');
  const [deliveryAgents, setDeliveryAgents] = useState<UserProfile[]>([]);
  const [deliveryAgentsLoading, setDeliveryAgentsLoading] = useState(false);
  const [pickupTime, setPickupTime] = useState('Today, 18:00 - 18:30');
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>('mtn_momo');
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);
  const [promoNotice, setPromoNotice] = useState<string | null>(null);
  const [allowPartialFulfillment, setAllowPartialFulfillment] = useState(false);
  const [branchRatings, setBranchRatings] = useState<Record<string, { rating: number; reviewCount: number }>>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shipping = useMemo(() => {
    if (deliveryMethod === 'pickup') {
      return 0;
    }

    return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : BASE_SHIPPING;
  }, [deliveryMethod, subtotal]);

  const previewPromoCode = normalizePromoCode(promoInput);
  const promoDiscount = useMemo(() => {
    const activeCode = appliedPromo || previewPromoCode;
    if (activeCode !== PROMO_CODE) {
      return 0;
    }

    return subtotal >= PROMO_MIN_SPEND ? PROMO_DISCOUNT : 0;
  }, [appliedPromo, previewPromoCode, subtotal]);

  const total = Math.max(subtotal + shipping - promoDiscount, 0);
  const eligiblePickupBranches = useMemo(() => {
    if (!items.length || !products.length) {
      return [];
    }

    return BRANCHES.filter((candidateBranch) =>
      items.every((item) => {
        const product = products.find((entry) => entry.id === item.product_id);
        if (!product) {
          return false;
        }

        return getProductStockForBranch(product, candidateBranch) >= item.quantity;
      })
    );
  }, [items, products]);

  const pickupFlexMode = deliveryMethod === 'pickup' && eligiblePickupBranches.length === 0;
  const effectivePickupFlex = pickupFlexMode || allowPartialFulfillment;
  const depositAmount = deliveryMethod === 'pickup'
    ? (effectivePickupFlex ? FLEX_PICKUP_DEPOSIT : PICKUP_DEPOSIT)
    : 0;
  const grandTotal = total + depositAmount;
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  const branchDetails = getBranchDetails(branch);
  const liveBranchReview = branchRatings[branch];
  const branchRating = liveBranchReview?.rating ?? branchDetails?.rating ?? 0;
  const branchReviewCount = liveBranchReview?.reviewCount ?? branchDetails?.reviewCount ?? 0;

  useEffect(() => {
    if (deliveryMethod === 'pickup') {
      setDeliveryOption('self_pickup');
      setDeliveryAgentId('');
      setDeliveryAgents([]);
      return;
    }

    if (deliveryOption === 'self_pickup') {
      setDeliveryOption('delivery_by_branch');
    }

    let cancelled = false;
    setDeliveryAgentsLoading(true);
    fetchBranchDirectory(branch, 'delivery_agent')
      .then((items) => {
        if (!cancelled) {
          setDeliveryAgents(items);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDeliveryAgents([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDeliveryAgentsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [branch, deliveryMethod, deliveryOption]);

  useEffect(() => {
    if (appliedPromo === PROMO_CODE && subtotal < PROMO_MIN_SPEND) {
      setAppliedPromo(null);
      setPromoNotice(
        `Promo removed because the cart is below RWF ${PROMO_MIN_SPEND.toLocaleString('en-US')}.`
      );
    }
  }, [appliedPromo, subtotal]);

  useEffect(() => {
    let cancelled = false;

    fetchBranchReviewSummaries()
      .then((items) => {
        if (cancelled) {
          return;
        }

        setBranchRatings(
          Object.fromEntries(
            items.map((item) => [item.branch, { rating: item.rating, reviewCount: item.review_count }])
          )
        );
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

  useEffect(() => {
    if (!user) {
      return;
    }

    let cancelled = false;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);

      try {
        const record = await fetchAccountProfile();
        if (cancelled) {
          return;
        }

        if (record) {
          setProfileId(record.id);
          setFullName(record.display_name || (user.name as string) || '');
          setPhone(record.phone || '');
          setAddress(record.addresses || '');
          setPaymentMethod(normalizeStoredPaymentMethod(record.preferred_payment_method));
          if (record.default_branch) {
            setBranch(record.default_branch);
          }
          return;
        }

        setProfileId(null);
        setFullName((user.name as string) || '');
      } catch (error) {
        if (!cancelled) {
          setProfileError(
            error instanceof Error ? error.message : 'Failed to load saved profile.'
          );
        }
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [setBranch, user]);

  useEffect(() => {
    items.forEach((item) => {
      const product = products.find((entry) => entry.id === item.product_id);
      const maxQuantity = product ? getProductStockForBranch(product, branch) : 0;
      syncStockLimit(item.product_id, maxQuantity);
    });
  }, [branch, items, products, syncStockLimit]);

  useEffect(() => {
    if (!products.length) {
      return;
    }

    if (deliveryMethod !== 'pickup') {
      if (allowPartialFulfillment) {
        setAllowPartialFulfillment(false);
      }
      return;
    }

    if (eligiblePickupBranches.length > 0) {
      if (!eligiblePickupBranches.includes(branch)) {
        setBranch(eligiblePickupBranches[0]);
      }
      if (allowPartialFulfillment) {
        setAllowPartialFulfillment(false);
      }
      return;
    }

    if (!allowPartialFulfillment) {
      setAllowPartialFulfillment(true);
    }
    if (pickupTime !== FLEX_PICKUP_WINDOW) {
      setPickupTime(FLEX_PICKUP_WINDOW);
    }
  }, [allowPartialFulfillment, branch, deliveryMethod, eligiblePickupBranches, pickupTime, products.length, setBranch]);

  const applyPromoCode = () => {
    const promoCode = normalizePromoCode(promoInput);
    const result = getPromoDiscount(promoCode, subtotal);

    if (result.error) {
      setFieldErrors((current) => ({ ...current, promo: result.error ?? undefined }));
      setAppliedPromo(null);
      setPromoNotice(null);
      return false;
    }

    if (!promoCode) {
      setAppliedPromo(null);
      setPromoNotice(null);
      setFieldErrors((current) => ({ ...current, promo: undefined }));
      return true;
    }

    setAppliedPromo(promoCode);
    setPromoNotice(`Promo ${promoCode} applied. You saved ${formatRWF(result.discount)}.`);
    setFieldErrors((current) => ({ ...current, promo: undefined }));
    return true;
  };

  const handlePromoInputChange = (value: string) => {
    setPromoInput(value);
    if (appliedPromo) {
      setAppliedPromo(null);
      setPromoNotice(null);
    }
    if (fieldErrors.promo) {
      setFieldErrors((current) => ({ ...current, promo: undefined }));
    }
    if (error) {
      setError(null);
    }
  };

  const handlePlaceOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user) {
      const returnPath = `${location.pathname}${location.search}${location.hash}` || '/checkout';
      setError(null);
      toast.error('Please sign in to place your order');
      navigate(`/login?next=${encodeURIComponent(returnPath)}`, {
        replace: true,
        state: { from: returnPath },
      });
      return;
    }

    if (!items.length) {
      setError('Your cart is empty. Add products before placing an order.');
      return;
    }

    if (!products.length) {
      setError('Loading stock, try again.');
      return;
    }

    const nextErrors: FieldErrors = {};
    if (!fullName.trim()) {
      nextErrors.name = 'Enter your full name.';
    }

    const phoneError = validatePhone(phone);
    if (phoneError) {
      nextErrors.phone = phoneError;
    }

    const addressError = validateAddress(address, deliveryMethod);
    if (addressError) {
      nextErrors.address = addressError;
    }
    if (deliveryMethod === 'delivery' && deliveryOption === 'delivery_by_delivery_guy' && !deliveryAgentId) {
      nextErrors.delivery_option = 'Choose a delivery agent.';
    }

    const promoCode = normalizePromoCode(promoInput) || appliedPromo || '';
    if (promoCode) {
      const promoResult = getPromoDiscount(promoCode, subtotal);
      if (promoResult.error) {
        nextErrors.promo = promoResult.error;
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      setError('Please fix the highlighted fields.');
      return;
    }

    const promoResult = getPromoDiscount(promoCode, subtotal);
    const discount = promoResult.discount;
    const orderAddress =
      deliveryMethod === 'pickup' && !address.trim()
        ? `Pickup from ${branch}`
        : address.trim();
    const successUrl = `${window.location.origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${window.location.origin}${STRIPE_CANCEL_PATH}`;

    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    setPromoNotice(null);

    try {
      const savedProfile = await saveAccountProfile(
        {
          display_name: fullName.trim(),
          phone: normalizePhone(phone),
          email: (user.email as string) || '',
          role: (user.role as string) || 'customer',
          default_branch: branch,
          addresses: address.trim(),
          preferred_payment_method: paymentMethod,
        },
        profileId
      ).catch((saveError) => {
        console.warn('Failed to save checkout profile', saveError);
        setProfileNotice('Checkout completed, but profile sync will try again next time.');
        return null;
      });

      if (savedProfile) {
        setProfileId(savedProfile.id);
      }

      const response = await createPaymentSession({
        customer_name: fullName.trim(),
        items: items.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          price: item.price,
          image: item.image,
          unit: item.unit,
          quantity: item.quantity,
        })),
        branch,
        phone: normalizePhone(phone),
        address: orderAddress,
        delivery_method: deliveryMethod,
        delivery_option: deliveryOption,
        delivery_agent_id: deliveryOption === 'delivery_by_delivery_guy' ? deliveryAgentId : undefined,
        pickup_time: deliveryMethod === 'pickup' ? (effectivePickupFlex ? FLEX_PICKUP_WINDOW : pickupTime) : undefined,
        payment_method: paymentMethod,
        promo_code: promoCode || null,
        allow_partial_fulfillment: effectivePickupFlex,
        success_url: paymentMethod === 'card' ? successUrl : undefined,
        cancel_url: paymentMethod === 'card' ? cancelUrl : undefined,
        currency: 'rwf',
      });

      if (paymentMethod === 'card') {
        if (!response.url) {
          throw new Error('Stripe did not return a checkout URL.');
        }

      toast.success(
        response.discount > 0
          ? `Promo applied. Redirecting to Stripe for ${formatRWF(response.total)}.`
          : `Redirecting to Stripe for ${formatRWF(response.total)}.`
      );
      window.location.assign(response.url);
      return;
    }

      clear();
      if (savedProfile) {
        setProfileNotice('Profile updated from checkout details.');
      }
      toast.success(
        response.message || `Order placed successfully. Total: ${formatRWF(response.total)}`
      );
      // Use setTimeout to ensure navigation happens after state updates
      setTimeout(() => {
        navigate(ORDER_HISTORY_PATH, { replace: true });
      }, 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to place order';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto flex max-w-2xl items-center justify-center py-24 text-center text-muted-foreground">
          &gt; syncing checkout session...
        </div>
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-2xl px-4 py-20 text-center">
          <ShoppingCart className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
          <h1 className="mb-3 text-2xl font-display text-primary crt-glow sm:text-3xl">
            CART IS EMPTY
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            &gt; Add products to your cart before heading to checkout.
          </p>
          <Link to="/shop" className="terminal-btn inline-flex items-center gap-2 text-sm">
            RETURN TO SHOP <ArrowRight className="h-4 w-4" />
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
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground">/checkout</div>
            <h1 className="text-2xl font-display text-primary crt-glow sm:text-3xl">
              {t('checkout.title')}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t('checkout.subtitle')}
            </p>
          </div>
          <Link
            to="/cart"
            className="text-xs uppercase tracking-wider text-muted-foreground transition-colors hover:text-primary"
          >
            BACK TO CART
          </Link>
        </div>

        {error && (
          <div className="mb-6 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        {!user && (
          <div className="mb-6 border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
            <div className="mb-2 font-semibold">Browse your order</div>
            <p>
              You can review your order and fill in delivery details below. You will be asked to sign in when you place the order.
            </p>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <form onSubmit={handlePlaceOrder} className="space-y-6">
            <section className="industrial-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-2 text-sm font-display text-primary">
                <MapPin className="h-4 w-4" />
                DELIVERY DETAILS
              </div>

              {profileLoading && (
                <div className="mb-4 border border-border bg-secondary/20 p-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  &gt; loading saved profile...
                </div>
              )}

              {profileError && (
                <div className="mb-4 border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                  {profileError}
                </div>
              )}

              {profileNotice && (
                <div className="mb-4 border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-100">
                  {profileNotice}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full name</Label>
                  <Input
                    id="fullName"
                    autoComplete="name"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(event) => {
                      setFullName(event.target.value);
                      if (fieldErrors.name) {
                        setFieldErrors((current) => ({ ...current, name: undefined }));
                      }
                      if (error) {
                        setError(null);
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.name)}
                  />
                  {fieldErrors.name ? (
                    <p className="text-xs text-red-300">{fieldErrors.name}</p>
                  ) : user ? (
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Account email: {user.email || 'unknown'}
                    </p>
                  ) : (
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-100">
                      You will be asked to sign in when placing the order.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="branch">Simba branch</Label>
                  <select
                    id="branch"
                    value={branch}
                    onChange={(event) => {
                      setBranch(event.target.value);
                      if (error) {
                        setError(null);
                      }
                    }}
                    className="w-full border border-border bg-input p-2 font-mono text-sm"
                  >
                    {(deliveryMethod === 'pickup' && eligiblePickupBranches.length > 0
                      ? eligiblePickupBranches
                      : BRANCHES
                    ).map((option) => {
                      const details = getBranchDetails(option);
                      const live = branchRatings[option];
                      const rating = live?.rating ?? details?.rating ?? 0;
                      return (
                        <option key={option} value={option}>
                          {option}
                          {details ? ` (${rating.toFixed(1)}★)` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {deliveryMethod === 'pickup' && eligiblePickupBranches.length === 0 && (
                    <div className="border border-amber-500/30 bg-amber-500/10 p-3 text-[10px] uppercase tracking-[0.2em] text-amber-100">
                      No branch has all listed items. Remove items or continue with any branch pickup.
                      <button
                        type="button"
                        onClick={() => setAllowPartialFulfillment(true)}
                        className="mt-2 block text-accent underline"
                      >
                        Continue with flexible pickup + {formatRWF(FLEX_PICKUP_DEPOSIT)}
                      </button>
                    </div>
                  )}
                  {branchDetails && (
                    <div className="space-y-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      <p>{branchDetails.address}</p>
                      <p className="text-accent">
                        {branchRating.toFixed(1)}★ · {branchReviewCount} {t('checkout.branchReviews')}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+250 7xx xxx xxx"
                    value={phone}
                    onChange={(event) => {
                      setPhone(event.target.value);
                      if (fieldErrors.phone) {
                        setFieldErrors((current) => ({ ...current, phone: undefined }));
                      }
                      if (error) {
                        setError(null);
                      }
                    }}
                    aria-invalid={Boolean(fieldErrors.phone)}
                  />
                  {fieldErrors.phone && (
                    <p className="text-xs text-red-300">{fieldErrors.phone}</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deliveryMethod">Delivery method</Label>
                  <select
                    id="deliveryMethod"
                    value={deliveryMethod}
                    onChange={(event) => {
                      const nextMethod = event.target.value as 'delivery' | 'pickup';
                      setDeliveryMethod(nextMethod);
                      setDeliveryOption(nextMethod === 'pickup' ? 'self_pickup' : 'delivery_by_branch');
                    }}
                    className="w-full border border-border bg-input p-2 font-mono text-sm"
                  >
                    <option value="pickup">{t('checkout.delivery.pickup')}</option>
                    <option value="delivery">{t('checkout.delivery.delivery')}</option>
                  </select>
                </div>

                {deliveryMethod === 'delivery' && (
                  <div className="space-y-2">
                    <Label htmlFor="deliveryOption">Delivery option</Label>
                    <select
                      id="deliveryOption"
                      value={deliveryOption}
                      onChange={(event) => {
                        setDeliveryOption(event.target.value as 'delivery_by_branch' | 'delivery_by_delivery_guy');
                        setDeliveryAgentId('');
                      }}
                      className="w-full border border-border bg-input p-2 font-mono text-sm"
                    >
                      <option value="delivery_by_branch">Delivery by branch</option>
                      <option value="delivery_by_delivery_guy">Delivery by delivery guy</option>
                    </select>
                    {fieldErrors.delivery_option && (
                      <p className="text-xs text-red-300">{fieldErrors.delivery_option}</p>
                    )}
                  </div>
                )}

                <div className="border border-dashed border-border bg-secondary/20 p-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {deliveryMethod === 'pickup'
                    ? `Branch ${branch} gets the order and branch staff are notified for pickup.`
                    : deliveryOption === 'delivery_by_delivery_guy'
                      ? 'The selected delivery agent gets the order and notifications.'
                      : 'The selected branch gets the order and delivery staff at that branch are notified.'}
                </div>

                {deliveryMethod === 'delivery' && deliveryOption === 'delivery_by_delivery_guy' && (
                  <div className="space-y-2">
                    <Label htmlFor="deliveryAgent">Delivery agent</Label>
                    <select
                      id="deliveryAgent"
                      value={deliveryAgentId}
                      onChange={(event) => setDeliveryAgentId(event.target.value)}
                      className="w-full border border-border bg-input p-2 font-mono text-sm"
                    >
                      <option value="">
                        {deliveryAgentsLoading ? 'Loading agents...' : 'Select delivery agent'}
                      </option>
                      {deliveryAgents.map((agent) => (
                        <option key={agent.user_id} value={agent.user_id}>
                          {agent.display_name || agent.email}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {deliveryMethod === 'pickup' && (
                  <div className="space-y-2">
                    <Label htmlFor="pickupTime">{t('checkout.pickupTime')}</Label>
                    <Input
                      id="pickupTime"
                      value={pickupTime}
                      onChange={(event) => setPickupTime(event.target.value)}
                      placeholder={pickupFlexMode ? FLEX_PICKUP_WINDOW : 'Today, 18:00 - 18:30'}
                    />
                  </div>
                )}

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="address">
                    {deliveryMethod === 'pickup' ? 'Pickup note' : 'Delivery address'}
                  </Label>
                  <Textarea
                    id="address"
                    placeholder={
                      deliveryMethod === 'pickup'
                        ? 'Optional pickup instructions'
                        : 'Street, district, landmark, apartment, etc.'
                    }
                    value={address}
                    onChange={(event) => {
                      setAddress(event.target.value);
                      if (fieldErrors.address) {
                        setFieldErrors((current) => ({ ...current, address: undefined }));
                      }
                      if (error) {
                        setError(null);
                      }
                    }}
                    rows={4}
                    aria-invalid={Boolean(fieldErrors.address)}
                  />
                  {fieldErrors.address ? (
                    <p className="text-xs text-red-300">{fieldErrors.address}</p>
                  ) : (
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Delivery details are saved to your profile for future orders.
                    </p>
                  )}
                </div>

                {deliveryMethod === 'pickup' && (
                  <div className="md:col-span-2 border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    <div className="text-[10px] uppercase tracking-[0.2em]">
                      {t('checkout.deposit')}: {formatRWF(depositAmount)}
                    </div>
                    <p className="mt-2">
                      {effectivePickupFlex
                        ? 'Flexible pickup needs more time. Collect in 3+ hours or the deposit stays on the order.'
                        : t('checkout.depositHelp')}
                    </p>
                  </div>
                )}

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="promoCode">Promo code</Label>
                  <div className="flex gap-2">
                    <Input
                      id="promoCode"
                      value={promoInput}
                      onChange={(event) => handlePromoInputChange(event.target.value)}
                      placeholder="SIMBA2K"
                      className="uppercase"
                    />
                    <Button type="button" variant="outline" onClick={applyPromoCode}>
                      APPLY
                    </Button>
                  </div>
                  {fieldErrors.promo ? (
                    <p className="text-xs text-red-300">{fieldErrors.promo}</p>
                  ) : promoNotice ? (
                    <p className="text-xs text-emerald-200">{promoNotice}</p>
                  ) : (
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      Use <span className="text-accent">{PROMO_CODE}</span> for RWF 2,000 off on
                      orders over RWF {PROMO_MIN_SPEND.toLocaleString('en-US')}.
                    </p>
                  )}
                </div>
              </div>
            </section>

            <section className="industrial-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-2 text-sm font-display text-primary">
                <CreditCard className="h-4 w-4" />
                PAYMENT METHOD
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {PAYMENT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const active = paymentMethod === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setPaymentMethod(option.value);
                        if (fieldErrors.payment) {
                          setFieldErrors((current) => ({ ...current, payment: undefined }));
                        }
                      }}
                      className={`border p-4 text-left transition-colors ${
                        active
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-secondary/20 hover:border-primary/50'
                      }`}
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <Icon className="h-5 w-5" />
                        <span className="border border-border px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {option.badge}
                        </span>
                      </div>
                      <div className="text-sm font-semibold">{option.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{option.description}</div>
                      <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {option.note}
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Selected payment:{' '}
                <span className="text-primary">{getPaymentMethodLabel(paymentMethod)}</span>
              </p>

              {fieldErrors.payment && (
                <p className="mt-3 text-xs text-red-300">{fieldErrors.payment}</p>
              )}

              <div className="mt-4 rounded-none border border-dashed border-border p-4 text-sm text-muted-foreground">
                {(paymentMethod === 'mtn_momo' || paymentMethod === 'airtel_money') && (
                  <div className="flex items-start gap-3">
                    <Phone className="mt-0.5 h-4 w-4 text-primary" />
                    <p>
                      MTN MoMo and Airtel Money are the primary payment methods. The order is
                      created first and payment confirmation follows from the mobile network.
                    </p>
                  </div>
                )}
                {paymentMethod === 'card' && (
                  <div className="flex items-start gap-3">
                    <CreditCard className="mt-0.5 h-4 w-4 text-primary" />
                    <p>
                      Your order will be created first, then you will be redirected to Stripe
                      for secure card checkout.
                    </p>
                  </div>
                )}
                {paymentMethod === 'cash_on_delivery' && (
                  <div className="flex items-start gap-3">
                    <Truck className="mt-0.5 h-4 w-4 text-primary" />
                    <p>Pay the courier when your order is delivered.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="industrial-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-2 text-sm font-display text-primary">
                <Package className="h-4 w-4" />
                FINAL CHECK
              </div>

              <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-5">
                <div className="border border-border bg-secondary/20 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.2em]">Customer</div>
                  <div className="text-foreground">{fullName || user?.name || user?.email || (user ? '-' : 'Sign in on submit')}</div>
                </div>
                <div className="border border-border bg-secondary/20 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.2em]">Branch</div>
                  <div className="text-foreground">{branch}</div>
                </div>
                <div className="border border-border bg-secondary/20 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.2em]">Payment</div>
                  <div className="text-foreground">{getPaymentMethodLabel(paymentMethod)}</div>
                </div>
                <div className="border border-border bg-secondary/20 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.2em]">Shipping</div>
                  <div className="text-foreground">
                    {shipping === 0 ? 'FREE' : formatRWF(shipping)}
                  </div>
                </div>
                <div className="border border-border bg-secondary/20 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.2em]">Deposit</div>
                  <div className="text-foreground">
                    {depositAmount > 0 ? formatRWF(depositAmount) : 'NONE'}
                  </div>
                </div>
                <div className="border border-border bg-secondary/20 p-3">
                  <div className="mb-1 text-[10px] uppercase tracking-[0.2em]">Promo</div>
                  <div className="text-foreground">
                    {promoDiscount > 0 ? `- ${formatRWF(promoDiscount)}` : 'NONE'}
                  </div>
                </div>
              </div>

              <Button type="submit" className="mt-6 w-full" disabled={submitting}>
                {submitting ? 'PROCESSING...' : getPaymentActionLabel(paymentMethod, grandTotal)}
              </Button>

              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Orders are saved to your account history after submission. Stripe payments are
                confirmed on the success page before the cart is cleared.
              </p>
            </section>
          </form>

          <aside className="space-y-4">
            <div className="industrial-border bg-card p-6 lg:sticky lg:top-32">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-2 text-sm font-display text-primary">
                <ShoppingCart className="h-4 w-4" />
                ORDER SUMMARY
              </div>

              <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div
                    key={item.product_id}
                    className="flex gap-3 border border-border bg-secondary/20 p-3"
                  >
                    <div className="h-14 w-14 shrink-0 border border-border bg-background">
                      <img
                        src={item.image}
                        alt={item.product_name}
                        className="h-full w-full object-contain p-1"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">{item.product_name}</div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        QTY {item.quantity}
                      </div>
                    </div>
                    <div className="shrink-0 text-right text-sm text-primary">
                      {formatRWF(item.price * item.quantity)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <div className="data-row">
                  <span className="label">BRANCH</span>
                  <span className="value">{branch}</span>
                </div>
                {branchDetails && (
                  <div className="data-row">
                    <span className="label">ADDRESS</span>
                    <span className="value">{branchDetails.shortAddress}</span>
                  </div>
                )}
                <div className="data-row">
                  <span className="label">CUSTOMER</span>
                  <span className="value">{fullName || user?.name || user?.email || '-'}</span>
                </div>
                {deliveryMethod === 'pickup' && (
                  <div className="data-row">
                    <span className="label">PICKUP TIME</span>
                    <span className="value">{pickupTime}</span>
                  </div>
                )}
                <div className="data-row">
                  <span className="label">PHONE</span>
                  <span className="value">{phone || '-'}</span>
                </div>
                <div className="data-row">
                  <span className="label">PAYMENT</span>
                  <span className="value">{getPaymentMethodLabel(paymentMethod)}</span>
                </div>
                <div className="data-row">
                  <span className="label">ROUTE</span>
                  <span className="value">
                    {deliveryMethod === 'pickup'
                      ? `Self pickup at ${branch}`
                      : deliveryOption === 'delivery_by_delivery_guy'
                        ? 'Delivery by delivery guy'
                        : 'Delivery by branch'}
                  </span>
                </div>
                <div className="data-row">
                  <span className="label">ITEMS</span>
                  <span className="value">{itemCount}</span>
                </div>
                <div className="data-row">
                  <span className="label">SUBTOTAL</span>
                  <span className="value">{formatRWF(subtotal)}</span>
                </div>
                <div className="data-row">
                  <span className="label">SHIPPING</span>
                  <span className="value">
                    {shipping === 0 ? <span className="text-accent">FREE</span> : formatRWF(shipping)}
                  </span>
                </div>
                <div className="data-row">
                  <span className="label">DEPOSIT</span>
                  <span className="value">
                    {depositAmount > 0 ? formatRWF(depositAmount) : 'NONE'}
                  </span>
                </div>
                <div className="data-row">
                  <span className="label">DISCOUNT</span>
                  <span className="value">
                    {promoDiscount > 0 ? (
                      <span className="text-accent">-{formatRWF(promoDiscount)}</span>
                    ) : (
                      'NONE'
                    )}
                  </span>
                </div>
                <div className="flex items-baseline justify-between border-t border-border pt-3">
                  <span className="text-sm uppercase">TOTAL</span>
                  <span className="text-2xl font-display text-primary crt-glow">
                    {formatRWF(grandTotal)}
                  </span>
                </div>
              </div>

              {deliveryMethod === 'delivery' && shipping > 0 && (
                <div className="mt-4 border border-dashed border-border p-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  &gt; Add {formatRWF(FREE_SHIPPING_THRESHOLD - subtotal)} more for free delivery
                </div>
              )}

              {deliveryMethod === 'pickup' && (
                <div className="mt-4 border border-dashed border-border p-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  &gt; store pickup selected. no shipping charge applied.
                </div>
              )}
            </div>

            <div className="industrial-border bg-card p-4 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Truck className="mt-0.5 h-4 w-4 text-primary" />
                <p>Delivery and payment details are stored with the order for tracking.</p>
              </div>
              <div className="mt-3 flex items-start gap-3">
                <Phone className="mt-0.5 h-4 w-4 text-primary" />
                <p>A valid phone number helps the delivery team reach you quickly.</p>
              </div>
            </div>
          </aside>
        </div>
      </div>

      <Footer />
    </div>
  );
}
