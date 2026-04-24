import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  User,
  Package,
  MapPin,
  LogOut,
  Eye,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  RefreshCcw,
  Save,
  Star,
} from 'lucide-react';
import Header from '@/components/layout/Header';
import Footer from '@/components/layout/Footer';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAccountOrders, fetchAccountProfile, saveAccountProfile, updateAccountOrder, type AccountProfileRecord } from '@/lib/account';
import { type CheckoutPaymentMethod } from '@/lib/checkout';
import { BRANCHES, Order, formatRWF, CartItem } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/lib/i18n';

const statusColor = (s: string) => {
  switch (s) {
    case 'pending': return 'border-accent text-accent bg-accent/10';
    case 'awaiting_payment': return 'border-accent text-accent bg-accent/10';
    case 'awaiting_confirmation': return 'border-accent text-accent bg-accent/10';
    case 'processing': return 'border-primary text-primary bg-primary/10';
    case 'shipped': return 'border-primary text-primary bg-primary/10';
    case 'delivered': return 'border-primary text-primary bg-primary/10';
    case 'cancelled': return 'border-destructive text-destructive bg-destructive/10';
    default: return 'border-border';
  }
};

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'pending': return <Clock className="h-3 w-3" />;
    case 'awaiting_payment': return <Clock className="h-3 w-3" />;
    case 'awaiting_confirmation': return <Clock className="h-3 w-3" />;
    case 'processing': return <Package className="h-3 w-3" />;
    case 'shipped': return <Truck className="h-3 w-3" />;
    case 'delivered': return <CheckCircle2 className="h-3 w-3" />;
    case 'cancelled': return <XCircle className="h-3 w-3" />;
    default: return <Clock className="h-3 w-3" />;
  }
};

const normalizePaymentMethod = (paymentMethod: string): 'card' | 'mtn_momo' | 'airtel_money' | 'cash_on_delivery' => {
  switch ((paymentMethod || '').trim().toLowerCase()) {
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
};

const getPaymentMethodLabel = (paymentMethod: string) => {
  switch (normalizePaymentMethod(paymentMethod)) {
    case 'mtn_momo':
      return 'MTN MoMo';
    case 'airtel_money':
      return 'Airtel Money';
    case 'cash_on_delivery':
      return 'Cash on Delivery';
    case 'card':
    default:
      return 'Stripe Card';
  }
};

const getPaymentStatusLabel = (order: Order) => {
  const method = normalizePaymentMethod(order.payment_method);
  const status = (order.status || '').trim().toLowerCase();

  if (status === 'cancelled') {
    return `${getPaymentMethodLabel(order.payment_method)} cancelled`;
  }

  if (method === 'card') {
    return status === 'processing' ? 'Card payment confirmed' : 'Card payment pending';
  }

  if (method === 'mtn_momo') {
    return status === 'processing' ? 'MTN MoMo confirmed' : 'MTN MoMo pending';
  }

  if (method === 'airtel_money') {
    return status === 'processing' ? 'Airtel Money confirmed' : 'Airtel Money pending';
  }

  if (method === 'cash_on_delivery') {
    return 'Pay on delivery';
  }

  return 'Payment pending';
};

const getPaymentStatusColor = (order: Order) => {
  const status = (order.status || '').trim().toLowerCase();
  if (status === 'cancelled') {
    return 'border-destructive text-destructive bg-destructive/10';
  }
  if (status === 'processing') {
    return 'border-primary text-primary bg-primary/10';
  }
  return 'border-accent text-accent bg-accent/10';
};

const PaymentStatusIcon = ({ order }: { order: Order }) => {
  const status = (order.status || '').trim().toLowerCase();
  if (status === 'cancelled') {
    return <XCircle className="h-3 w-3" />;
  }
  if (status === 'processing') {
    return <CheckCircle2 className="h-3 w-3" />;
  }
  return <Clock className="h-3 w-3" />;
};

type AccountFormState = {
  display_name: string;
  phone: string;
  email: string;
  role: string;
  default_branch: string;
  addresses: string;
  preferred_payment_method: CheckoutPaymentMethod;
};

const paymentMethodOptions: Array<{ value: CheckoutPaymentMethod; label: string }> = [
  { value: 'mtn_momo', label: 'MTN MoMo' },
  { value: 'airtel_money', label: 'Airtel Money' },
  { value: 'card', label: 'Stripe Card' },
  { value: 'cash_on_delivery', label: 'Cash on Delivery' },
];

const normalizeProfilePaymentMethod = (value: string | null | undefined): CheckoutPaymentMethod => {
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
      return 'card';
  }
};

const orderStages = ['received', 'processing', 'out_for_delivery', 'delivered'] as const;

function parseOrderTimeline(order: Order): Array<{ status: string; label: string; at?: string | null }> {
  if (Array.isArray(order.timeline)) {
    return order.timeline;
  }

  if (typeof order.timeline === 'string') {
    try {
      const parsed = JSON.parse(order.timeline);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
}

function getOrderRouteLabel(order: Order, translate?: (key: string) => string): string {
  if ((order.delivery_method || '').trim().toLowerCase() === 'pickup') {
    return `${translate?.('account.selfPickupAt') || 'Self pickup at'} ${order.branch}`;
  }

  switch ((order.delivery_option || '').trim().toLowerCase()) {
    case 'delivery_by_delivery_guy':
      return order.assigned_delivery_agent_name
        ? `${translate?.('account.deliveryGuy') || 'Delivery guy'}: ${order.assigned_delivery_agent_name}`
        : translate?.('account.deliveryByGuy') || 'Delivery by delivery guy';
    case 'delivery_by_branch':
    default:
      return `${translate?.('account.branchDelivery') || 'Branch delivery'}: ${order.assigned_branch || order.branch}`;
  }
}

function getOrderStageIndex(order: Order): number {
  const status = (order.status || '').trim().toLowerCase();
  if (status === 'cancelled') {
    return -1;
  }
  if (status === 'delivered') {
    return 3;
  }
  if (status === 'shipped') {
    return 2;
  }
  if (status === 'processing') {
    return 1;
  }
  return 0;
}

const emptyProfileState = (userName: string, userEmail: string): AccountFormState => ({
  display_name: userName,
  phone: '',
  email: userEmail,
  role: 'user',
  default_branch: BRANCHES[0],
  addresses: '',
  preferred_payment_method: 'mtn_momo',
});

const Account: React.FC = () => {
  const { user, loading, login, logout } = useAuth();
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tab = searchParams.get('tab') || 'profile';

  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [profile, setProfile] = useState<AccountFormState>(
    emptyProfileState('', '')
  );
  const [orderActionBusy, setOrderActionBusy] = useState<number | null>(null);

  const loadOrders = async () => {
    setLoadingOrders(true);
    setOrdersError(null);
    try {
      const items = await fetchAccountOrders();
      setOrders(items);
    } catch (error) {
      setOrders([]);
      const message = error instanceof Error ? error.message : t('account.loadOrdersError');
      setOrdersError(
        message.includes('401') || message.toLowerCase().includes('authentication')
          ? 'Session expired. Sign in again to load orders.'
          : message || t('account.loadOrdersError')
      );
    } finally {
      setLoadingOrders(false);
    }
  };

  const loadProfile = async () => {
    if (!user) {
      return;
    }

    setLoadingProfile(true);
    setProfileError(null);
    try {
      const record = await fetchAccountProfile();
      const fallback = emptyProfileState(
        (user.name as string) || '',
        (user.email as string) || ''
      );

      if (record) {
        setProfileId(record.id);
        setProfile({
          display_name: record.display_name || fallback.display_name,
          phone: record.phone || '',
          email: record.email || fallback.email,
          role: record.role || fallback.role,
          default_branch: record.default_branch || fallback.default_branch,
          addresses: record.addresses || '',
          preferred_payment_method: normalizeProfilePaymentMethod(
            record.preferred_payment_method
          ),
        });
      } else {
        setProfileId(null);
        setProfile({
          ...fallback,
          preferred_payment_method: 'mtn_momo',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : t('account.loadProfileError');
      setProfileError(
        message.includes('401') || message.toLowerCase().includes('authentication')
          ? 'Session expired. Sign in again to load profile.'
          : message || t('account.loadProfileError')
      );
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) {
      return;
    }

    const draft: AccountProfileRecord = {
      id: profileId || 0,
      user_id: String(user.id),
      display_name: profile.display_name.trim() || (user.name as string) || '',
      phone: profile.phone.trim(),
      email: profile.email.trim() || (user.email as string) || '',
      role: profile.role || 'user',
      default_branch: profile.default_branch || BRANCHES[0],
      addresses: profile.addresses.trim(),
      preferred_payment_method: profile.preferred_payment_method,
      created_at: new Date().toISOString(),
    };

    if (!draft.display_name) {
      setProfileError(t('account.enterDisplayName'));
      return;
    }

    if (!draft.phone) {
      setProfileError(t('account.enterPhone'));
      return;
    }

    setSavingProfile(true);
    setProfileError(null);
    setProfileNotice(null);

    try {
      const saved = await saveAccountProfile(
        {
          display_name: draft.display_name,
          phone: draft.phone,
          email: draft.email,
          role: draft.role,
          default_branch: draft.default_branch,
          addresses: draft.addresses,
          preferred_payment_method: draft.preferred_payment_method,
        },
        profileId
      );

      setProfileId(saved.id);
      setProfileNotice(t('account.profileSaved'));
      setProfile((current) => ({
        ...current,
        display_name: saved.display_name || current.display_name,
        phone: saved.phone || current.phone,
        email: saved.email || current.email,
        role: saved.role || current.role,
        default_branch: saved.default_branch || current.default_branch,
        addresses: saved.addresses || current.addresses,
        preferred_payment_method: normalizeProfilePaymentMethod(
          saved.preferred_payment_method
        ),
      }));
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : 'Failed to save profile.'
      );
    } finally {
      setSavingProfile(false);
    }
  };

  useEffect(() => {
    if (!user) return;
    void loadOrders();
    void loadProfile();
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="text-center py-20 text-muted-foreground">&gt; {t('account.authenticating')}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="mx-auto max-w-md px-4 py-20 text-center">
          <User className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-3xl font-display text-primary crt-glow mb-3">
            {t('account.signInRequired')}
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            {t('account.signInRequiredBody')}
          </p>
          <button onClick={() => login()} className="terminal-btn text-sm">
            {t('account.signInRegister')}
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  const parseItems = (s: string): CartItem[] => {
    try { return JSON.parse(s); } catch { return []; }
  };

  const handleCancelOrder = async (order: Order) => {
    setOrderActionBusy(order.id);
    try {
      await updateAccountOrder(order.id, { status: 'cancelled' });
      await loadOrders();
    } finally {
      setOrderActionBusy(null);
    }
  };

  const handleRateOrder = async (order: Order, rating: number) => {
    setOrderActionBusy(order.id);
    try {
      await updateAccountOrder(order.id, {
        rating,
        review_branch: order.branch,
      });
      await loadOrders();
    } finally {
      setOrderActionBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-display text-primary crt-glow terminal-prompt sm:text-3xl">
          {t('account.title')}
        </h1>
        <div className="text-xs text-muted-foreground mb-6">
          &gt; {t('account.welcomeBack')}{' '}
          <span className="text-primary">
            {profile.display_name || (user.name as string) || (user.email as string) || t('account.operator')}
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-4">
          {/* Sidebar */}
          <aside className="lg:col-span-1">
            <div className="industrial-border p-4 bg-card space-y-1">
              <button
                onClick={() => setSearchParams({ tab: 'profile' })}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider transition-colors ${
                  tab === 'profile' ? 'bg-primary/10 text-primary border border-primary/50' : 'hover:bg-secondary'
                }`}
              >
                <User className="h-4 w-4" /> {t('account.profile')}
              </button>
              <button
                onClick={() => setSearchParams({ tab: 'orders' })}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider transition-colors ${
                  tab === 'orders' ? 'bg-primary/10 text-primary border border-primary/50' : 'hover:bg-secondary'
                }`}
              >
                <Package className="h-4 w-4" /> {t('account.orders')} [{orders.length}]
              </button>
              <button
                onClick={() => setSearchParams({ tab: 'addresses' })}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider transition-colors ${
                  tab === 'addresses' ? 'bg-primary/10 text-primary border border-primary/50' : 'hover:bg-secondary'
                }`}
              >
                <MapPin className="h-4 w-4" /> {t('account.addresses')}
              </button>
              <div className="border-t border-border my-2"></div>
              <button
                onClick={async () => { await logout(); setTimeout(() => navigate('/'), 100); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-wider hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" /> {t('account.logout')}
              </button>
            </div>
          </aside>

          {/* Main */}
          <main className="lg:col-span-3">
            {tab === 'profile' && (
              <div className="space-y-4">
                <div className="industrial-border p-6 bg-card">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-display text-primary">&gt; {t('account.yourProfile')}</h2>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        void loadProfile();
                      }}
                      disabled={loadingProfile || savingProfile}
                    >
                      <RefreshCcw className="h-4 w-4" />
                      {t('account.refresh')}
                    </Button>
                  </div>

                  {profileError && (
                    <div className="mb-4 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                      {profileError}
                    </div>
                  )}

                  {profileNotice && (
                    <div className="mb-4 border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                      {profileNotice}
                    </div>
                  )}

                  {loadingProfile ? (
                    <div className="py-12 text-center text-muted-foreground">
                      &gt; syncing profile...
                    </div>
                  ) : (
                    <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
                      <div className="space-y-4">
                        <div className="border border-border bg-secondary/20 p-4">
                          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {t('account.accountDetails')}
                          </div>
                          <div className="mt-3 space-y-2 text-sm">
                            <div className="data-row">
                              <span className="label">{t('account.name')}</span>
                              <span className="value">{(user.name as string) || '-'}</span>
                            </div>
                            <div className="data-row">
                              <span className="label">{t('account.email')}</span>
                              <span className="value">{(user.email as string) || '-'}</span>
                            </div>
                            <div className="data-row">
                              <span className="label">{t('account.orders')}</span>
                              <span className="value">{orders.length}</span>
                            </div>
                          </div>
                        </div>

                        <div className="border border-dashed border-border bg-secondary/20 p-4">
                          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {t('account.savedDetails')}
                          </div>
                          <div className="mt-3 space-y-2 text-sm">
                            <div className="data-row">
                              <span className="label">{t('account.displayName')}</span>
                              <span className="value">{profile.display_name || '-'}</span>
                            </div>
                            <div className="data-row">
                              <span className="label">{t('account.phone')}</span>
                              <span className="value">{profile.phone || '-'}</span>
                            </div>
                            <div className="data-row">
                              <span className="label">{t('account.defaultBranch')}</span>
                              <span className="value">{profile.default_branch || '-'}</span>
                            </div>
                            <div className="data-row">
                              <span className="label">{t('account.paymentPref')}</span>
                              <span className="value">{getPaymentMethodLabel(profile.preferred_payment_method)}</span>
                            </div>
                            <div className="data-row">
                              <span className="label">{t('account.address')}</span>
                              <span className="value">{profile.addresses || '-'}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <form
                        className="space-y-4"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void handleSaveProfile();
                        }}
                      >
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label htmlFor="display_name">{t('account.fullName')}</Label>
                            <Input
                              id="display_name"
                              value={profile.display_name}
                              onChange={(event) =>
                                setProfile((current) => ({
                                  ...current,
                                  display_name: event.target.value,
                                }))
                              }
                              placeholder={t('account.fullNamePlaceholder')}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="phone">{t('account.phoneNumber')}</Label>
                            <Input
                              id="phone"
                              type="tel"
                              value={profile.phone}
                              onChange={(event) =>
                                setProfile((current) => ({
                                  ...current,
                                  phone: event.target.value,
                                }))
                              }
                              placeholder={t('account.phonePlaceholder')}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="branch">{t('account.defaultBranch')}</Label>
                            <select
                              id="branch"
                              value={profile.default_branch}
                              onChange={(event) =>
                                setProfile((current) => ({
                                  ...current,
                                  default_branch: event.target.value,
                                }))
                              }
                              className="w-full border border-border bg-input p-2 font-mono text-sm"
                            >
                              {BRANCHES.map((branch) => (
                                <option key={branch} value={branch}>
                                  {branch}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor="payment_method">{t('account.preferredPayment')}</Label>
                            <select
                              id="payment_method"
                              value={profile.preferred_payment_method}
                              onChange={(event) =>
                                setProfile((current) => ({
                                  ...current,
                                  preferred_payment_method: normalizeProfilePaymentMethod(
                                    event.target.value
                                  ),
                                }))
                              }
                              className="w-full border border-border bg-input p-2 font-mono text-sm"
                            >
                              {paymentMethodOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="email">{t('account.email')}</Label>
                          <Input
                            id="email"
                            value={profile.email}
                            readOnly
                            className="cursor-not-allowed bg-secondary/20"
                          />
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {t('account.managedByAuth')}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="addresses">{t('account.savedAddress')}</Label>
                          <Textarea
                            id="addresses"
                            value={profile.addresses}
                            onChange={(event) =>
                              setProfile((current) => ({
                                ...current,
                                addresses: event.target.value,
                              }))
                            }
                            rows={5}
                            placeholder={t('account.addressPlaceholder')}
                          />
                        </div>

                        <div className="grid gap-3 md:grid-cols-2">
                          <Button type="submit" className="gap-2" disabled={savingProfile}>
                            <Save className="h-4 w-4" />
                            {savingProfile ? t('account.saving') : t('account.saveProfile')}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              void loadProfile();
                            }}
                            disabled={loadingProfile || savingProfile}
                          >
                            {t('account.resetFromSaved')}
                          </Button>
                        </div>

                        <div className="border border-dashed border-border bg-secondary/20 p-4 text-xs text-muted-foreground">
                          <p>
                            {t('account.profileNote')}
                          </p>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'orders' && (
              <div className="space-y-4">
                <div className="industrial-border p-6 bg-card">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-xl font-display text-primary">&gt; {t('account.yourOrders')}</h2>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => {
                        void loadOrders();
                      }}
                      disabled={loadingOrders}
                    >
                      <RefreshCcw className="h-4 w-4" />
                      {t('account.refresh')}
                    </Button>
                  </div>

                  {ordersError && (
                    <div className="mb-4 border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                      {ordersError}
                    </div>
                  )}

                  {loadingOrders ? (
                    <div className="text-center py-10 text-muted-foreground">&gt; {t('account.fetching')}</div>
                  ) : orders.length === 0 ? (
                    <div className="text-center py-10 border border-dashed border-border">
                      <div className="text-muted-foreground mb-3">&gt; {t('account.noOrders')}</div>
                      <button onClick={() => navigate('/shop')} className="terminal-btn text-xs">
                        {t('account.startShopping')}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {orders.map((order) => (
                        <div key={order.id} className="border border-border bg-secondary/20 p-4">
                          <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                            <div>
                              <div className="font-mono text-xs text-muted-foreground">
                                ORDER <span className="text-primary">#{order.id}</span> &bull; {order.tracking_number}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {new Date(order.created_at).toLocaleString()}
                              </div>
                            </div>
                            <span className={`tag uppercase ${statusColor(order.status || 'pending')} flex items-center gap-1`}>
                              <StatusIcon status={order.status || 'pending'} />
                              {order.status || 'pending'}
                            </span>
                          </div>
                        <div className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 md:grid-cols-4">
                          <div>
                            <div className="text-muted-foreground text-[10px]">{t('account.method')}</div>
                            <div>{order.delivery_method.toUpperCase()}</div>
                          </div>
                            <div>
                              <div className="text-muted-foreground text-[10px]">{t('account.branch')}</div>
                              <div className="truncate">{order.branch}</div>
                            </div>
                            <div>
                            <div className="text-muted-foreground text-[10px]">{t('account.payment')}</div>
                            <div>{getPaymentMethodLabel(order.payment_method)}</div>
                            <span
                              className={`tag mt-1 uppercase ${getPaymentStatusColor(order)} flex w-fit items-center gap-1`}
                            >
                              <PaymentStatusIcon order={order} />
                              {getPaymentStatusLabel(order)}
                            </span>
                          </div>
                            <div>
                              <div className="text-muted-foreground text-[10px]">ROUTE</div>
                              <div>{getOrderRouteLabel(order, t)}</div>
                            </div>
                            <div>
                              <div className="text-muted-foreground text-[10px]">{t('account.total')}</div>
                              <div className="text-primary font-bold">{formatRWF(order.total)}</div>
                            </div>
                          </div>
                          <div className="mt-3 grid gap-2 sm:grid-cols-4">
                            {orderStages.map((stage, index) => {
                              const activeStage = getOrderStageIndex(order);
                              const active = activeStage >= index;
                              return (
                                <div
                                  key={stage}
                                  className={`border px-3 py-2 text-[10px] uppercase tracking-[0.2em] ${
                                    active
                                      ? 'border-primary bg-primary/10 text-primary'
                                      : 'border-border bg-secondary/20 text-muted-foreground'
                                  }`}
                                >
                                  {stage.replace(/_/g, ' ')}
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex justify-end mt-3">
                            <div className="flex flex-wrap gap-3">
                              {['pending', 'awaiting_payment', 'awaiting_confirmation', 'processing'].includes(order.status || '') && (
                                <button
                                  onClick={() => void handleCancelOrder(order)}
                                  disabled={orderActionBusy === order.id}
                                  className="text-xs flex items-center gap-1 text-destructive hover:underline disabled:opacity-50"
                                >
                                  <XCircle className="h-3 w-3" /> {t('account.cancel')}
                                </button>
                              )}
                              {(order.status || '') === 'delivered' && (
                                <div className="flex items-center gap-1 text-amber-300">
                                  {[1, 2, 3, 4, 5].map((value) => (
                                    <button
                                      key={value}
                                      onClick={() => void handleRateOrder(order, value)}
                                      disabled={orderActionBusy === order.id}
                                      className="disabled:opacity-50"
                                      aria-label={`Rate ${value} stars`}
                                    >
                                      <Star
                                        className={`h-3.5 w-3.5 ${
                                          value <= Number(order.rating || 0)
                                            ? 'fill-current text-amber-300'
                                            : 'text-muted-foreground'
                                        }`}
                                      />
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => setSelectedOrder(order)}
                                className="text-xs flex items-center gap-1 text-primary hover:underline"
                              >
                                <Eye className="h-3 w-3" /> {t('account.viewDetails')}
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedOrder && (
                  <div
                    className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-4"
                    onClick={() => setSelectedOrder(null)}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="industrial-border bg-card max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
                    >
                      <div className="flex items-center justify-between mb-4 border-b border-border pb-2">
                          <h3 className="text-xl font-display text-primary">
                          {t('account.order')} #{selectedOrder.id}
                        </h3>
                        <button onClick={() => setSelectedOrder(null)} className="text-muted-foreground hover:text-primary">
                          <XCircle className="h-5 w-5" />
                        </button>
                      </div>
                      <div className="mb-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                        <div className="data-row"><span className="label">{t('account.status')}</span><span className="value">{(selectedOrder.status || 'pending').toUpperCase()}</span></div>
                        <div className="data-row"><span className="label">{t('account.tracking')}</span><span className="value">{selectedOrder.tracking_number}</span></div>
                        <div className="data-row"><span className="label">{t('account.method')}</span><span className="value">{selectedOrder.delivery_method || '-'}</span></div>
                        <div className="data-row"><span className="label">{t('account.route')}</span><span className="value">{getOrderRouteLabel(selectedOrder, t)}</span></div>
                        <div className="data-row"><span className="label">{t('account.paymentMethod')}</span><span className="value">{getPaymentMethodLabel(selectedOrder.payment_method)}</span></div>
                        <div className="data-row"><span className="label">{t('account.paymentStatus')}</span><span className="value">{getPaymentStatusLabel(selectedOrder)}</span></div>
                        <div className="data-row"><span className="label">{t('account.address')}</span><span className="value">{selectedOrder.address}</span></div>
                        <div className="data-row"><span className="label">{t('account.phone')}</span><span className="value">{selectedOrder.phone}</span></div>
                      </div>
                      <div className="mb-4 grid gap-2 sm:grid-cols-4">
                        {orderStages.map((stage, index) => {
                          const activeStage = getOrderStageIndex(selectedOrder);
                          const active = activeStage >= index;
                          return (
                            <div
                              key={stage}
                              className={`border px-3 py-2 text-[10px] uppercase tracking-[0.2em] ${
                                active
                                  ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-border bg-secondary/20 text-muted-foreground'
                              }`}
                            >
                              {stage.replace(/_/g, ' ')}
                            </div>
                          );
                        })}
                      </div>
                      {parseOrderTimeline(selectedOrder).length > 0 && (
                        <div className="mb-4 border border-border bg-secondary/20 p-3 text-xs">
                          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {t('account.timeline')}
                          </div>
                          <div className="space-y-2">
                            {parseOrderTimeline(selectedOrder).map((item) => (
                              <div key={`${item.status}-${item.at || item.label}`} className="flex items-center justify-between gap-3">
                                <span className="text-foreground">{item.label}</span>
                                <span className="text-muted-foreground">{item.at || '-'}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <h4 className="text-sm font-display text-primary mb-2">{t('account.items')}</h4>
                      <div className="space-y-2 mb-4">
                        {parseItems(selectedOrder.items).map((i) => (
                          <div key={i.product_id} className="flex gap-2 text-xs border border-border p-2">
                            <div className="w-10 h-10 bg-secondary shrink-0">
                              <img src={i.image} alt={i.product_name} className="w-full h-full object-contain" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="truncate">{i.product_name}</div>
                              <div className="text-muted-foreground">x{i.quantity} @ {formatRWF(i.price)}</div>
                            </div>
                            <div className="text-primary shrink-0">{formatRWF(i.price * i.quantity)}</div>
                          </div>
                        ))}
                      </div>
                      <div className="border-t border-border pt-3 space-y-1">
                        <div className="data-row"><span className="label">{t('account.subtotal')}</span><span className="value">{formatRWF(selectedOrder.subtotal)}</span></div>
                        <div className="data-row"><span className="label">{t('account.shipping')}</span><span className="value">{formatRWF(selectedOrder.shipping)}</span></div>
                        {selectedOrder.discount > 0 && (
                          <div className="data-row"><span className="label">{t('account.discount')}</span><span className="value text-accent">-{formatRWF(selectedOrder.discount)}</span></div>
                        )}
                        <div className="flex justify-between pt-2 border-t border-border">
                          <span className="text-sm uppercase">{t('account.total')}</span>
                          <span className="text-xl font-display text-primary crt-glow">{formatRWF(selectedOrder.total)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === 'addresses' && (
              <div className="industrial-border p-6 bg-card">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-xl font-display text-primary">&gt; {t('account.savedAddresses')}</h2>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSearchParams({ tab: 'profile' })}
                  >
                    {t('account.editProfile')}
                  </Button>
                </div>
                <div className="space-y-4">
                  {profile.addresses ? (
                    <div className="border border-border bg-secondary/20 p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {t('account.primaryAddress')}
                      </div>
                      <div className="mt-2 text-sm text-foreground whitespace-pre-line">
                        {profile.addresses}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-10 border border-dashed border-border">
                      <MapPin className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                      <div className="text-sm text-muted-foreground mb-1">&gt; {t('account.noSavedAddresses')}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {t('account.savedAddressesHelp')}
                      </div>
                    </div>
                  )}

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="border border-border bg-secondary/20 p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {t('account.defaultBranch')}
                      </div>
                      <div className="mt-2 text-sm text-foreground">{profile.default_branch || '-'}</div>
                    </div>
                    <div className="border border-border bg-secondary/20 p-4">
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {t('account.preferredPayment')}
                      </div>
                      <div className="mt-2 text-sm text-foreground">
                        {getPaymentMethodLabel(profile.preferred_payment_method)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default Account;
