import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BadgePercent,
  BarChart3,
  ChevronRight,
  Clock,
  CreditCard,
  Eye,
  Flame,
  Layers3,
  MapPin,
  Package,
  PackageCheck,
  PieChart as PieChartIcon,
  RefreshCw,
  Shield,
  ShoppingBag,
  Store,
  TrendingUp,
  Truck,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from 'recharts';
import Header from '@/components/layout/Header';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ProductCreatePanel from '@/components/admin/ProductCreatePanel';
import RoleInvitePanel from '@/components/admin/RoleInvitePanel';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchAdminInvitations,
  fetchAdminOrders,
  fetchAdminProfiles,
  updateAdminOrder,
  updateAdminProduct,
} from '@/lib/admin';
import { useProducts } from '@/hooks/useProducts';
import { getProductStockForBranch } from '@/lib/product-stock';
import {
  BRANCHES,
  CartItem,
  formatRWF,
  getBranchDetails,
  Invitation,
  Order,
  Product,
  UserProfile,
} from '@/lib/types';
import {
  PERMISSION_ROWS,
  STORE_ROLE_CARDS,
  canManageProducts,
  getStoreRoleMeta,
  normalizeStoreRole,
} from '@/lib/store-roles';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n';

type RangeKey = '7d' | '30d' | '90d' | 'all';
type PaymentKey =
  | 'mtn_momo'
  | 'airtel_money'
  | 'cash_on_delivery'
  | 'card'
  | 'unknown';
type StatusKey =
  | 'pending'
  | 'awaiting_payment'
  | 'awaiting_confirmation'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'other';

type RevenuePoint = {
  label: string;
  timestamp: number;
  revenue: number;
};

type CategoryPoint = {
  name: string;
  value: number;
};

type BranchPoint = {
  branch: string;
  orders: number;
  revenue: number;
  share: number;
};

type TopProductPoint = {
  product: Product;
  quantity: number;
  revenue: number;
};

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'all', label: 'All time' },
];

const PAYMENT_COLORS: Record<PaymentKey, string> = {
  mtn_momo: 'hsl(142 76% 44%)',
  airtel_money: 'hsl(24 95% 53%)',
  cash_on_delivery: 'hsl(215 20% 65%)',
  card: 'hsl(195 85% 55%)',
  unknown: 'hsl(0 0% 55%)',
};

const CATEGORY_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--accent))',
  'hsl(195 85% 55%)',
  'hsl(142 76% 44%)',
  'hsl(24 95% 53%)',
  'hsl(265 85% 65%)',
  'hsl(45 95% 55%)',
];

function normalizeText(value?: string | null): string {
  return (value || '').trim().toLowerCase();
}

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatShortDate(value?: string | null): string {
  const date = parseDate(value);
  if (!date) {
    return value || '-';
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayLabel(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function getRangeStart(range: RangeKey): Date | null {
  if (range === 'all') {
    return null;
  }

  const days = Number(range.replace('d', ''));
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function parseOrderItems(items: string): CartItem[] {
  try {
    const parsed = JSON.parse(items);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function discountedPrice(product: Product): number {
  const price = Number(product.price) || 0;
  const discount = Number(product.discount) || 0;
  return Math.round(discount > 0 ? price * (1 - discount / 100) : price);
}

function normalizePaymentMethod(value?: string | null): PaymentKey {
  switch (normalizeText(value)) {
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
    case 'stripe':
      return 'card';
    default:
      return 'unknown';
  }
}

function getPaymentLabel(value?: string | null): string {
  switch (normalizePaymentMethod(value)) {
    case 'mtn_momo':
      return 'MTN MoMo';
    case 'airtel_money':
      return 'Airtel Money';
    case 'cash_on_delivery':
      return 'Cash on delivery';
    case 'card':
      return 'Stripe card';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function getPaymentTone(value?: string | null): string {
  switch (normalizePaymentMethod(value)) {
    case 'mtn_momo':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
    case 'airtel_money':
      return 'border-orange-400/30 bg-orange-500/10 text-orange-100';
    case 'cash_on_delivery':
      return 'border-slate-400/30 bg-slate-500/10 text-slate-100';
    case 'card':
      return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
    case 'unknown':
    default:
      return 'border-border bg-secondary/40 text-muted-foreground';
  }
}

function getStatusKey(value?: string | null): StatusKey {
  switch (normalizeText(value)) {
    case 'pending':
      return 'pending';
    case 'awaiting_payment':
      return 'awaiting_payment';
    case 'awaiting_confirmation':
      return 'awaiting_confirmation';
    case 'processing':
      return 'processing';
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'other';
  }
}

function getStatusLabel(value?: string | null): string {
  switch (getStatusKey(value)) {
    case 'pending':
      return 'Pending';
    case 'awaiting_payment':
      return 'Awaiting payment';
    case 'awaiting_confirmation':
      return 'Awaiting confirmation';
    case 'processing':
      return 'Processing';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    case 'other':
    default:
      return normalizeText(value).replace(/_/g, ' ') || 'Unknown';
  }
}

function getStatusTone(value?: string | null): string {
  switch (getStatusKey(value)) {
    case 'pending':
    case 'awaiting_payment':
    case 'awaiting_confirmation':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
    case 'processing':
      return 'border-primary/30 bg-primary/10 text-primary';
    case 'shipped':
      return 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100';
    case 'delivered':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
    case 'cancelled':
      return 'border-destructive/30 bg-destructive/10 text-destructive';
    case 'other':
    default:
      return 'border-border bg-secondary/40 text-muted-foreground';
  }
}

function getPermissionTone(value: string): string {
  switch (value) {
    case 'all':
      return 'border-violet-400/30 bg-violet-500/10 text-violet-100';
    case 'branch':
      return 'border-blue-400/30 bg-blue-500/10 text-blue-100';
    case 'assigned':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-100';
    case 'own':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100';
    case 'yes':
      return 'border-primary/30 bg-primary/10 text-primary';
    case '-':
    default:
      return 'border-border bg-secondary/40 text-muted-foreground';
  }
}

function getPermissionLabel(value: string): string {
  switch (value) {
    case 'all':
      return 'ALL';
    case 'branch':
      return 'BRANCH';
    case 'assigned':
      return 'ASSIGNED';
    case 'own':
      return 'OWN';
    case 'yes':
      return 'YES';
    case '-':
    default:
      return 'NONE';
  }
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
  icon: Icon,
  action,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          <Icon className="h-3 w-3 text-primary" />
          {eyebrow}
        </div>
        <h2 className="mt-1 text-2xl font-display text-primary crt-glow">{title}</h2>
        {subtitle && (
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext?: string;
}) {
  return (
    <div className="industrial-border bg-card/90 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {label}
        </div>
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <div className="mt-3 text-3xl font-display text-primary crt-glow">{value}</div>
      {subtext && <div className="mt-2 text-[11px] text-muted-foreground">{subtext}</div>}
    </div>
  );
}

function MiniProductCard({
  product,
  badge,
  badgeTone,
}: {
  product: Product;
  badge: string;
  badgeTone: string;
}) {
  return (
    <Link
      to={`/product/${product.id}`}
      className="card-industrial flex gap-3 p-3"
      aria-label={product.name}
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden border border-border bg-background p-1">
        <img
          src={product.image}
          alt={product.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {product.category}
        </div>
        <div className="mt-1 truncate text-sm text-foreground">{product.name}</div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-primary crt-glow">
              {formatRWF(discountedPrice(product))}
            </div>
            {product.discount > 0 && (
              <div className="text-[10px] line-through text-muted-foreground">
                {formatRWF(product.price)}
              </div>
            )}
          </div>
          <Badge
            variant="outline"
            className={`uppercase tracking-[0.2em] ${badgeTone}`}
          >
            {badge}
          </Badge>
        </div>
      </div>
    </Link>
  );
}

export default function Admin() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { products, loading: loadingProducts } = useProducts();

  const [orders, setOrders] = useState<Order[]>([]);
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [invitationsError, setInvitationsError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [range, setRange] = useState<RangeKey>('30d');
  const [refreshTick, setRefreshTick] = useState(0);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<number, string>>({});
  const [deliveryDrafts, setDeliveryDrafts] = useState<Record<number, string>>({});
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<number | null>(null);
  const [busyProductId, setBusyProductId] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<Array<{ id: number; text: string; at: string }>>([]);
  const previousOrdersRef = useRef<Map<number, string>>(new Map());
  const location = useLocation();
  const navigate = useNavigate();

  const activePanel = useMemo<'overview' | 'orders' | 'inventory' | 'roles' | 'deliveries'>(() => {
    const segment = location.pathname.split('/admin/')[1]?.split('/')[0] || 'overview';
    if (
      segment === 'orders' ||
      segment === 'inventory' ||
      segment === 'roles' ||
      segment === 'deliveries' ||
      segment === 'overview'
    ) {
      return segment;
    }

    if (normalizeStoreRole(user?.role) === 'delivery_agent') {
      return 'deliveries';
    }

    return 'overview';
  }, [location.pathname]);

  const roleMeta = getStoreRoleMeta(user?.role);
  const canCreateProducts = canManageProducts(user?.role);
  const deliveryNavOnly = normalizeStoreRole(user?.role) === 'delivery_agent';

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoadingDashboard(true);
      setOrdersError(null);
      setProfilesError(null);
      setInvitationsError(null);

      const [ordersResult, profilesResult, invitationsResult] = await Promise.allSettled([
        fetchAdminOrders(1000),
        fetchAdminProfiles(1000),
        fetchAdminInvitations(),
      ]);

      if (cancelled) {
        return;
      }

      if (ordersResult.status === 'fulfilled') {
        const previousOrders = previousOrdersRef.current;
        const nextOrdersMap = new Map<number, string>();
        const nextNotifications: Array<{ id: number; text: string; at: string }> = [];

        ordersResult.value.forEach((order) => {
          const status = (order.status || '').trim().toLowerCase();
          nextOrdersMap.set(order.id, status);

          const previousStatus = previousOrders.get(order.id);
          if (!previousStatus) {
            nextNotifications.unshift({
              id: order.id,
              text: `New order #${order.id} from ${order.branch || 'unknown branch'}`,
              at: order.created_at || new Date().toISOString(),
            });
            return;
          }

          if (previousStatus !== status) {
            nextNotifications.unshift({
              id: order.id,
              text: `Order #${order.id} changed to ${status.replace(/_/g, ' ')}`,
              at: order.created_at || new Date().toISOString(),
            });
          }
        });

        previousOrdersRef.current = nextOrdersMap;
        setOrders(ordersResult.value);
        if (nextNotifications.length > 0) {
          setNotifications((current) => [...nextNotifications, ...current].slice(0, 8));
        }
      } else {
        setOrders([]);
        setOrdersError(
          ordersResult.reason instanceof Error
            ? ordersResult.reason.message
            : t('account.loadOrdersError')
        );
      }

      if (profilesResult.status === 'fulfilled') {
        setProfiles(profilesResult.value);
      } else {
        setProfiles([]);
        setProfilesError(
          profilesResult.reason instanceof Error
            ? profilesResult.reason.message
            : t('account.loadProfileError')
        );
      }

      if (invitationsResult.status === 'fulfilled') {
        setInvitations(invitationsResult.value);
      } else {
        setInvitations([]);
        setInvitationsError(
          invitationsResult.reason instanceof Error
            ? invitationsResult.reason.message
            : t('account.loadProfileError')
        );
      }

      setLastSynced(new Date().toISOString());
      setLoadingDashboard(false);
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [refreshTick, user?.id]);

  useEffect(() => {
    if (!deliveryNavOnly) {
      return;
    }

    if (activePanel !== 'deliveries') {
      navigate('/admin/deliveries', { replace: true });
    }
  }, [activePanel, deliveryNavOnly, navigate]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRefreshTick((value) => value + 1);
    }, 30000);

    return () => window.clearInterval(timer);
  }, []);

  async function handleAssignStaff(order: Order) {
    const staffId = assignmentDrafts[order.id];
    const staff = branchStaffProfiles.find((profile) => profile.user_id === staffId);
    if (!staffId || !staff) {
      toast.error(t('admin.selectBranchStaff'));
      return;
    }

    setBusyOrderId(order.id);
    try {
      await updateAdminOrder(order.id, {
        status: order.status === 'pending' ? 'processing' : order.status,
        assigned_branch: order.assigned_branch || order.branch,
        assigned_staff_id: staff.user_id,
        assigned_staff_name: staff.display_name || staff.email,
      });
      toast.success(t('admin.assignStaff'));
      setRefreshTick((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('account.loadProfileError'));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleAssignDelivery(order: Order) {
    const agentId = deliveryDrafts[order.id];
    const agent = deliveryProfiles.find((profile) => profile.user_id === agentId);
    if (!agentId || !agent) {
      toast.error(t('admin.selectDeliveryAgent'));
      return;
    }

    setBusyOrderId(order.id);
    try {
      await updateAdminOrder(order.id, {
        status: order.status === 'processing' ? 'shipped' : order.status,
        assigned_delivery_agent_id: agent.user_id,
        assigned_delivery_agent_name: agent.display_name || agent.email,
        delivery_option: 'delivery_by_delivery_guy',
      });
      toast.success(t('admin.assignDelivery'));
      setRefreshTick((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('account.loadProfileError'));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleAdvanceOrder(order: Order, nextStatus: string) {
    setBusyOrderId(order.id);
    try {
      await updateAdminOrder(order.id, { status: nextStatus });
      toast.success(`Order moved to ${nextStatus.replace('_', ' ')}.`);
      setRefreshTick((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('account.loadOrdersError'));
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleAdjustStock(product: Product, delta: number) {
    if (branchFilter === 'all') {
      toast.error('Select a branch before adjusting stock.');
      return;
    }

    const branchKey = branchFilter;
    const existingStock =
      typeof product.branch_stock === 'object' && product.branch_stock
        ? Number(product.branch_stock[branchKey] || 0)
        : Number(product.stock_count || 0);
    const nextStock = Math.max(existingStock + delta, 0);
    const nextBranchStock =
      typeof product.branch_stock === 'object' && product.branch_stock
        ? { ...product.branch_stock, [branchKey]: nextStock }
        : { [branchKey]: nextStock };

    setBusyProductId(product.id);
    try {
      await updateAdminProduct(product.id, {
        stock_count: nextStock,
        in_stock: nextStock > 0,
        branch: branchKey,
        branch_stock: JSON.stringify(nextBranchStock),
      });
      toast.success(t('admin.inventory'));
      setRefreshTick((value) => value + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('account.loadOrdersError'));
    } finally {
      setBusyProductId(null);
    }
  }

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products]
  );

  const visibleOrders = useMemo(() => {
    const startDate = getRangeStart(range);
    const normalizedBranch = normalizeText(branchFilter);

    return [...orders]
      .filter((order) => {
        const createdAt = parseDate(order.created_at);
        if (startDate && (!createdAt || createdAt < startDate)) {
          return false;
        }

        if (branchFilter !== 'all') {
          return normalizeText(order.branch) === normalizedBranch;
        }

        return true;
      })
      .sort((a, b) => {
        const aDate = parseDate(a.created_at)?.getTime() || 0;
        const bDate = parseDate(b.created_at)?.getTime() || 0;
        return bDate - aDate;
      });
  }, [branchFilter, orders, range]);

  const visibleProfiles = useMemo(() => {
    if (branchFilter === 'all') {
      return profiles;
    }

    const normalizedBranch = normalizeText(branchFilter);
    return profiles.filter(
      (profile) => normalizeText(profile.default_branch) === normalizedBranch
    );
  }, [branchFilter, profiles]);

  const customerLookup = useMemo(
    () => new Map(profiles.map((profile) => [profile.user_id, profile])),
    [profiles]
  );

  const currentProfile = useMemo(
    () => profiles.find((profile) => profile.user_id === user?.id) || null,
    [profiles, user?.id]
  );

  const branchStaffProfiles = useMemo(
    () =>
      profiles.filter(
        (profile) =>
          normalizeText(profile.role) === 'branch_staff' ||
          normalizeText(profile.role) === 'branch_manager'
      ),
    [profiles]
  );

  const deliveryProfiles = useMemo(
    () => profiles.filter((profile) => normalizeText(profile.role) === 'delivery_agent'),
    [profiles]
  );

  const itemSales = useMemo(() => {
    return visibleOrders.flatMap((order) => {
      const items = parseOrderItems(order.items);
      return items.map((item) => ({
        order,
        item,
        product: productById.get(item.product_id),
      }));
    });
  }, [productById, visibleOrders]);

  const totalRevenue = useMemo(
    () => visibleOrders.reduce((sum, order) => sum + (Number(order.total) || 0), 0),
    [visibleOrders]
  );

  const totalShipping = useMemo(
    () => visibleOrders.reduce((sum, order) => sum + (Number(order.shipping) || 0), 0),
    [visibleOrders]
  );

  const totalDiscount = useMemo(
    () => visibleOrders.reduce((sum, order) => sum + (Number(order.discount) || 0), 0),
    [visibleOrders]
  );

  const totalUnitsSold = useMemo(
    () =>
      itemSales.reduce(
        (sum, entry) => sum + (Number(entry.item.quantity) || 0),
        0
      ),
    [itemSales]
  );

  const averageOrderValue = visibleOrders.length
    ? totalRevenue / visibleOrders.length
    : 0;

  const waitingOrders = visibleOrders.filter((order) =>
    ['pending', 'awaiting_payment', 'awaiting_confirmation'].includes(
      getStatusKey(order.status)
    )
  );
  const processingOrders = visibleOrders.filter(
    (order) => getStatusKey(order.status) === 'processing'
  );
  const shippedOrders = visibleOrders.filter(
    (order) => getStatusKey(order.status) === 'shipped'
  );
  const deliveredOrders = visibleOrders.filter(
    (order) => getStatusKey(order.status) === 'delivered'
  );
  const cancelledOrders = visibleOrders.filter(
    (order) => getStatusKey(order.status) === 'cancelled'
  );
  const incomingOrders = visibleOrders.filter((order) =>
    ['pending', 'awaiting_payment', 'awaiting_confirmation', 'processing', 'shipped'].includes(
      getStatusKey(order.status)
    )
  );
  const isDeliveryAgent = normalizeStoreRole(user?.role) === 'delivery_agent';
  const isBranchOperator = ['super_admin', 'branch_manager', 'branch_staff'].includes(
    normalizeStoreRole(user?.role)
  );
  const currentUserId = String(user?.id || '');
  const deliveryAgentOrders = useMemo(
    () =>
      visibleOrders.filter(
        (order) => normalizeText(order.assigned_delivery_agent_id) === normalizeText(currentUserId)
      ),
    [currentUserId, visibleOrders]
  );
  const stockScopeLabel = branchFilter === 'all' ? 'All branches' : branchFilter;

  const fulfillmentRate = visibleOrders.length
    ? Math.round((deliveredOrders.length / visibleOrders.length) * 100)
    : 0;

  const paymentSummary = useMemo(() => {
    const map = new Map<PaymentKey, number>();
    visibleOrders.forEach((order) => {
      const key = normalizePaymentMethod(order.payment_method);
      map.set(key, (map.get(key) || 0) + 1);
    });

    return (Object.keys(PAYMENT_COLORS) as PaymentKey[]).map((key) => ({
      name: getPaymentLabel(key),
      value: map.get(key) || 0,
      key,
    }));
  }, [visibleOrders]);

  const branchSummary = useMemo<BranchPoint[]>(() => {
    return BRANCHES.map((branch) => {
      const branchOrders = visibleOrders.filter(
        (order) => normalizeText(order.branch) === normalizeText(branch)
      );

      const revenue = branchOrders.reduce(
        (sum, order) => sum + (Number(order.total) || 0),
        0
      );

      return {
        branch,
        orders: branchOrders.length,
        revenue,
        share: visibleOrders.length
          ? Math.round((branchOrders.length / visibleOrders.length) * 100)
          : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [visibleOrders]);

  const revenueTrend = useMemo<RevenuePoint[]>(() => {
    const map = new Map<number, RevenuePoint>();

    visibleOrders.forEach((order) => {
      const date = parseDate(order.created_at);
      if (!date) {
        return;
      }

      const dayStart = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate()
      ).getTime();
      const existing = map.get(dayStart);
      const label = formatDayLabel(date);

      if (existing) {
        existing.revenue += Number(order.total) || 0;
      } else {
        map.set(dayStart, {
          label,
          timestamp: dayStart,
          revenue: Number(order.total) || 0,
        });
      }
    });

    return Array.from(map.values())
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-14);
  }, [visibleOrders]);

  const categorySales = useMemo<CategoryPoint[]>(() => {
    const map = new Map<string, number>();

    itemSales.forEach((entry) => {
      const category = entry.product?.category || 'Unmapped';
      const lineTotal = (Number(entry.item.price) || 0) * (Number(entry.item.quantity) || 0);
      map.set(category, (map.get(category) || 0) + lineTotal);
    });

    const rows = Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    if (rows.length > 0) {
      return rows.slice(0, 6);
    }

    return products
      .reduce((acc, product) => {
        const existing = acc.find((item) => item.name === product.category);
        if (existing) {
          existing.value += 1;
        } else {
          acc.push({ name: product.category, value: 1 });
        }
        return acc;
      }, [] as CategoryPoint[])
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [itemSales, products]);

  const catalogStats = useMemo(() => {
    const promoCount = products.filter((product) => product.discount > 0).length;
    const inStockCount = products.filter((product) => product.in_stock).length;
    const outOfStockCount = products.filter((product) => !product.in_stock).length;
    const topRatedCount = products.filter((product) => product.rating >= 4.5).length;

    return {
      total: products.length,
      promoCount,
      inStockCount,
      outOfStockCount,
      topRatedCount,
    };
  }, [products]);

  const promoProducts = useMemo(
    () =>
      [...products]
        .filter((product) => product.discount > 0)
        .sort((a, b) => b.discount - a.discount || b.rating - a.rating)
        .slice(0, 6),
    [products]
  );

  const bestRatedProducts = useMemo(
    () =>
      [...products]
        .sort((a, b) => b.rating - a.rating || b.discount - a.discount)
        .slice(0, 6),
    [products]
  );

  const watchlistProducts = useMemo(() => {
    const flagged = [...products]
      .filter((product) => !product.in_stock || product.rating < 4.2)
      .sort((a, b) => {
        const aScore = (a.in_stock ? 0 : 1) + (a.rating < 4.2 ? 1 : 0);
        const bScore = (b.in_stock ? 0 : 1) + (b.rating < 4.2 ? 1 : 0);
        return bScore - aScore || a.rating - b.rating;
      })
      .slice(0, 6);

    if (flagged.length > 0) {
      return flagged;
    }

    return [...products].sort((a, b) => a.rating - b.rating).slice(0, 6);
  }, [products]);

  const topProductsBySales = useMemo<TopProductPoint[]>(() => {
    const map = new Map<
      number,
      {
        product: Product;
        quantity: number;
        revenue: number;
      }
    >();

    itemSales.forEach((entry) => {
      if (!entry.product) {
        return;
      }

      const quantity = Number(entry.item.quantity) || 0;
      const revenue = (Number(entry.item.price) || 0) * quantity;
      const existing = map.get(entry.product.id);

      if (existing) {
        existing.quantity += quantity;
        existing.revenue += revenue;
      } else {
        map.set(entry.product.id, {
          product: entry.product,
          quantity,
          revenue,
        });
      }
    });

    return Array.from(map.values())
      .sort((a, b) => b.quantity - a.quantity || b.revenue - a.revenue)
      .slice(0, 6);
  }, [itemSales]);

  const recentOrders = useMemo(() => visibleOrders.slice(0, 12), [visibleOrders]);

  const selectedOrderItems = useMemo(
    () => (selectedOrder ? parseOrderItems(selectedOrder.items) : []),
    [selectedOrder]
  );

  const selectedOrderCustomer = selectedOrder
    ? customerLookup.get(selectedOrder.user_id) || null
    : null;

  const formatPercentage = (value: number) => `${value.toLocaleString('en-US')}%`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />

      <main className="relative overflow-hidden">
        <div className="absolute inset-0 grid-bg opacity-20" />
        <div className="absolute inset-0 scanlines-strong pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 py-8 md:py-10">
          {(ordersError || profilesError || invitationsError) && (
            <div className="mb-6 grid gap-3">
              {ordersError && (
                <div className="border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Orders feed: {ordersError}
                </div>
              )}
              {profilesError && (
                <div className="border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Profile feed: {profilesError}
                </div>
              )}
              {invitationsError && (
                <div className="border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                  Invitation feed: {invitationsError}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <div className="sticky top-32 space-y-4">
                <div className="industrial-border bg-card/90 p-4">
                  <div className="flex items-center gap-3 border-b border-border pb-3">
                    <Store className="h-8 w-8 text-primary" />
                    <div>
                      <div className="font-display text-2xl text-primary crt-glow">
                        SIMBA
                      </div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        Supermarket control desk
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {(
                      deliveryNavOnly
                        ? [{ id: 'deliveries', label: 'My deliveries', icon: Truck }]
                        : [
                            { id: 'overview', label: 'Overview', icon: BarChart3 },
                            { id: 'orders', label: 'Orders', icon: ShoppingBag },
                            { id: 'inventory', label: 'Inventory', icon: Package },
                            { id: 'roles', label: 'Access', icon: Shield },
                          ]
                    ).map((item) => {
                      const Icon = item.icon;
                      return (
                        <Link
                          key={item.id}
                          to={`/admin/${item.id}`}
                          className={`flex w-full items-center gap-3 border px-3 py-2 text-left text-xs uppercase tracking-[0.2em] transition-colors ${
                            activePanel === item.id
                              ? 'border-primary bg-primary/10 text-primary'
                              : 'border-border bg-secondary/20 hover:border-primary hover:text-primary'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                          <ChevronRight className="ml-auto h-3 w-3" />
                        </Link>
                      );
                    })}
                  </div>
                </div>

                <div className="industrial-border bg-card/90 p-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    Current access
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-lg font-display text-primary crt-glow">
                        {roleMeta.label}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {roleMeta.description}
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`uppercase tracking-[0.2em] ${roleMeta.badgeClass}`}
                    >
                      {roleMeta.key.replace('_', ' ')}
                    </Badge>
                  </div>
                  <div className="mt-3 text-xs text-muted-foreground">
                    {roleMeta.scope}
                  </div>
                </div>
              </div>
            </aside>

            <div className="space-y-6">
              {activePanel === 'deliveries' && isDeliveryAgent && (
                <section id="deliveries" className="space-y-6">
                  <div className="industrial-border bg-card/90 p-5 md:p-6">
                    <SectionTitle
                      eyebrow="Delivery queue"
                      title="My assigned orders"
                      subtitle="Orders assigned to your account. Use this workspace to move deliveries through dispatch and completion."
                      icon={Truck}
                    />

                    <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                      <div className="border border-border bg-secondary/20 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Assigned orders
                          </div>
                          <Badge className="tag uppercase">
                            {deliveryAgentOrders.length} active
                          </Badge>
                        </div>
                        <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                          {deliveryAgentOrders.length > 0 ? (
                            deliveryAgentOrders.map((order) => (
                              <button
                                key={order.id}
                                type="button"
                                onClick={() => setSelectedOrder(order)}
                                className={`w-full border p-3 text-left transition-colors ${
                                  selectedOrder?.id === order.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border bg-card/70 hover:border-primary/60'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <div className="font-mono text-sm text-primary">#{order.id}</div>
                                    <div className="mt-1 text-sm text-foreground">
                                      {customerLookup.get(order.user_id)?.display_name ||
                                        customerLookup.get(order.user_id)?.email ||
                                        'Customer'}
                                    </div>
                                    <div className="mt-1 text-xs text-muted-foreground">
                                      {order.branch || '-'} • {formatShortDate(order.created_at)}
                                    </div>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={`uppercase tracking-[0.2em] ${getStatusTone(order.status)}`}
                                  >
                                    {getStatusLabel(order.status)}
                                  </Badge>
                                </div>
                              </button>
                            ))
                          ) : (
                            <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                              No orders are assigned to you yet.
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border border-border bg-secondary/20 p-4">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Status actions
                          </div>
                          {selectedOrder && (
                            <Badge variant="outline" className={`uppercase tracking-[0.2em] ${getStatusTone(selectedOrder.status)}`}>
                              {getStatusLabel(selectedOrder.status)}
                            </Badge>
                          )}
                        </div>

                        {selectedOrder ? (
                          <div className="space-y-3">
                            <div className="data-row">
                              <span className="label">ROUTE</span>
                              <span className="value">
                                {selectedOrder.delivery_method === 'pickup'
                                  ? 'Self pickup'
                                  : selectedOrder.delivery_option === 'delivery_by_delivery_guy'
                                    ? 'Delivery by delivery guy'
                                    : 'Branch delivery'}
                              </span>
                            </div>
                            <div className="data-row">
                              <span className="label">ADDRESS</span>
                              <span className="value">{selectedOrder.address || '-'}</span>
                            </div>
                            <div className="data-row">
                              <span className="label">TOTAL</span>
                              <span className="value">{formatRWF(selectedOrder.total)}</span>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2">
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => void handleAdvanceOrder(selectedOrder, 'shipped')}
                                disabled={
                                  busyOrderId === selectedOrder.id ||
                                  getStatusKey(selectedOrder.status) !== 'processing'
                                }
                              >
                                Mark out for delivery
                              </Button>
                              <Button
                                type="button"
                                onClick={() => void handleAdvanceOrder(selectedOrder, 'delivered')}
                                disabled={
                                  busyOrderId === selectedOrder.id ||
                                  getStatusKey(selectedOrder.status) !== 'shipped'
                                }
                              >
                                Mark delivered
                              </Button>
                            </div>

                            <div className="border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground">
                              Delivery agents manage only orders assigned to them from this queue.
                            </div>
                          </div>
                        ) : (
                          <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                            Select one of your assigned orders to update its delivery status.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              )}

              {activePanel === 'overview' && (
                <>
              <section
                id="overview"
                className="industrial-border bg-card/90 p-5 md:p-6 scanlines"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                      /admin/dashboard
                    </div>
                    <h1 className="mt-2 text-4xl font-display text-primary crt-glow terminal-prompt">
                      SIMBA STORE DASHBOARD
                    </h1>
                    <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
                      Live store view for orders, revenue, inventory, promos, and
                      access roles. Built for supermarket operations with fast
                      visibility across branches.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge className="tag uppercase">LIVE ORDERS {visibleOrders.length}</Badge>
                      <Badge className="tag uppercase">PROMO SKUS {catalogStats.promoCount}</Badge>
                      <Badge className="tag uppercase">
                        ACCESS {roleMeta.label.toUpperCase()}
                      </Badge>
                      <Badge className="tag uppercase">
                        LAST SYNC {lastSynced ? formatShortDate(lastSynced) : 'PENDING'}
                      </Badge>
                    </div>
                    <div className="mt-4 border border-border bg-secondary/20 p-3">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        Live notifications
                      </div>
                      <div className="mt-2 max-h-40 space-y-2 overflow-y-auto">
                        {notifications.length > 0 ? (
                          notifications.map((notification) => (
                            <div key={`${notification.id}-${notification.at}`} className="rounded border border-border bg-background/60 p-2 text-xs">
                              <div>{notification.text}</div>
                              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                {formatShortDate(notification.at)}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-xs text-muted-foreground">Waiting for new orders...</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-[280px] gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                    <div className="border border-border bg-secondary/20 p-3">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        Branch filter
                      </div>
                      <select
                        value={branchFilter}
                        onChange={(event) => setBranchFilter(event.target.value)}
                        className="mt-2 w-full border border-border bg-input p-2 font-mono text-xs"
                      >
                        <option value="all">All branches</option>
                        {BRANCHES.map((branch) => (
                          <option key={branch} value={branch}>
                            {branch}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="border border-border bg-secondary/20 p-3">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        Time range
                      </div>
                      <select
                        value={range}
                        onChange={(event) => setRange(event.target.value as RangeKey)}
                        className="mt-2 w-full border border-border bg-input p-2 font-mono text-xs"
                      >
                        {RANGE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="gap-2"
                      onClick={() => setRefreshTick((value) => value + 1)}
                      disabled={loadingDashboard}
                    >
                      <RefreshCw className="h-4 w-4" />
                      {loadingDashboard ? 'SYNCING...' : 'REFRESH DATA'}
                    </Button>
                    <Link to="/shop" className="terminal-btn text-xs text-center">
                      OPEN STOREFRONT
                    </Link>
                  </div>
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                  icon={CreditCard}
                  label="Gross revenue"
                  value={formatRWF(totalRevenue)}
                  subtext={`Average basket ${formatRWF(averageOrderValue)}`}
                />
                <MetricCard
                  icon={ShoppingBag}
                  label="Orders"
                  value={visibleOrders.length.toLocaleString('en-US')}
                  subtext={`${waitingOrders.length} waiting, ${processingOrders.length} processing`}
                />
                <MetricCard
                  icon={Users}
                  label="Customers"
                  value={visibleProfiles.length.toLocaleString('en-US')}
                  subtext="Saved profiles and repeat buyers"
                />
                <MetricCard
                  icon={BadgePercent}
                  label="Promo products"
                  value={catalogStats.promoCount.toLocaleString('en-US')}
                  subtext={`${catalogStats.outOfStockCount} out of stock, ${catalogStats.topRatedCount} top rated`}
                />
              </section>

              <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  {
                    label: 'Waiting',
                    value: waitingOrders.length,
                    icon: Clock,
                    tone: 'border-amber-400/30 bg-amber-500/10 text-amber-100',
                    sub: 'Awaiting payment or confirmation',
                  },
                  {
                    label: 'Processing',
                    value: processingOrders.length,
                    icon: Package,
                    tone: 'border-primary/30 bg-primary/10 text-primary',
                    sub: 'Packed and being handled',
                  },
                  {
                    label: 'Shipped',
                    value: shippedOrders.length,
                    icon: Truck,
                    tone: 'border-cyan-400/30 bg-cyan-500/10 text-cyan-100',
                    sub: 'Out for delivery',
                  },
                  {
                    label: 'Delivered',
                    value: deliveredOrders.length,
                    icon: PackageCheck,
                    tone: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100',
                    sub: `${fulfillmentRate}% fulfilled`,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.label} className="industrial-border bg-card/90 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                          {item.label}
                        </div>
                        <Badge variant="outline" className={`uppercase ${item.tone}`}>
                          <Icon className="h-3 w-3" />
                        </Badge>
                      </div>
                      <div className="mt-3 text-3xl font-display text-primary crt-glow">
                        {item.value.toLocaleString('en-US')}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">{item.sub}</div>
                    </div>
                  );
                })}
              </section>

              <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
                <div className="industrial-border bg-card/90 p-5">
                  <SectionTitle
                    eyebrow="Revenue trend"
                    title="Recent sales pulse"
                    subtitle="Daily order revenue from the current branch and time window."
                    icon={TrendingUp}
                  />

                  {loadingDashboard && revenueTrend.length === 0 ? (
                    <div className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
                      Loading revenue trend...
                    </div>
                  ) : revenueTrend.length > 0 ? (
                    <div className="h-[320px]">
                      <ChartContainer
                        config={{
                          revenue: {
                            label: 'Revenue',
                            color: 'hsl(var(--primary))',
                          },
                        }}
                      >
                        <BarChart data={revenueTrend} margin={{ left: 4, right: 12, top: 8 }}>
                          <CartesianGrid vertical={false} strokeDasharray="3 3" />
                          <XAxis
                            dataKey="label"
                            tickLine={false}
                            axisLine={false}
                            tickMargin={10}
                          />
                          <YAxis
                            tickLine={false}
                            axisLine={false}
                            width={70}
                            tickFormatter={(value) =>
                              Number(value) >= 1000
                                ? `${Math.round(Number(value) / 1000)}k`
                                : `${value}`
                            }
                          />
                          <ChartTooltip
                            content={
                              <ChartTooltipContent
                                formatter={(value) => formatRWF(Number(value))}
                              />
                            }
                          />
                          <Bar
                            dataKey="revenue"
                            fill="hsl(var(--primary))"
                            radius={[6, 6, 0, 0]}
                          />
                        </BarChart>
                      </ChartContainer>
                    </div>
                  ) : (
                    <div className="flex h-[320px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
                      No revenue data in this time window.
                    </div>
                  )}
                </div>

                <div className="space-y-6">
                  <div className="industrial-border bg-card/90 p-5">
                    <SectionTitle
                      eyebrow="Sales mix"
                      title="Sales by category"
                      subtitle="Revenue split from products sold in the selected window."
                      icon={PieChartIcon}
                    />

                    {categorySales.length > 0 ? (
                      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                        <div className="h-[280px]">
                          <ChartContainer
                            config={{
                              value: {
                                label: 'Sales',
                                color: 'hsl(var(--accent))',
                              },
                            }}
                          >
                            <PieChart>
                              <Pie
                                data={categorySales}
                                dataKey="value"
                                nameKey="name"
                                innerRadius={70}
                                outerRadius={108}
                                paddingAngle={3}
                                stroke="hsl(var(--background))"
                              >
                                {categorySales.map((entry, index) => (
                                  <Cell
                                    key={entry.name}
                                    fill={CATEGORY_COLORS[index % CATEGORY_COLORS.length]}
                                  />
                                ))}
                              </Pie>
                              <ChartTooltip
                                content={
                                  <ChartTooltipContent
                                    formatter={(value) => formatRWF(Number(value))}
                                  />
                                }
                              />
                            </PieChart>
                          </ChartContainer>
                        </div>

                        <div className="space-y-3">
                          {categorySales.map((entry, index) => {
                            const total = categorySales.reduce((sum, item) => sum + item.value, 0);
                            const share = total
                              ? Math.round((entry.value / total) * 100)
                              : 0;

                            return (
                              <div key={entry.name} className="border border-border bg-secondary/20 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-sm text-foreground">{entry.name}</div>
                                    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                      {share}% share
                                    </div>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className="border-border bg-background/40 text-xs uppercase"
                                  >
                                    #{index + 1}
                                  </Badge>
                                </div>
                                <div className="mt-3 text-sm font-semibold text-primary crt-glow">
                                  {formatRWF(entry.value)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-[280px] items-center justify-center border border-dashed border-border text-sm text-muted-foreground">
                        No category sales available yet.
                      </div>
                    )}
                  </div>

                  <div className="industrial-border bg-card/90 p-5">
                    <SectionTitle
                      eyebrow="Branch pulse"
                      title="Branch performance"
                      subtitle="Quick branch share and revenue coverage for the selected window."
                      icon={MapPin}
                    />
                    <div className="space-y-3">
                      {branchSummary.map((branch) => (
                        <div key={branch.branch} className="border border-border bg-secondary/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="text-sm text-foreground">{branch.branch}</div>
                              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                {branch.orders} orders
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-semibold text-primary crt-glow">
                                {formatRWF(branch.revenue)}
                              </div>
                              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                {formatPercentage(branch.share)}
                              </div>
                            </div>
                          </div>
                          <Progress value={branch.share} className="mt-3 h-2" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
                </>
              )}

              {activePanel === 'orders' && (
              <section id="orders" className="industrial-border bg-card/90 p-5 md:p-6">
                <SectionTitle
                  eyebrow="Order feed"
                  title="Recent orders"
                  subtitle="Live order list with branch, payment method, and delivery status."
                  icon={ShoppingBag}
                />

                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  {paymentSummary.map((item) => (
                    <div key={item.key} className="border border-border bg-secondary/20 p-3">
                      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        {item.name}
                      </div>
                      <div className="mt-2 text-2xl font-display text-primary crt-glow">
                        {item.value.toLocaleString('en-US')}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <div className="border border-border bg-secondary/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Shipping total
                    </div>
                    <div className="mt-2 text-xl font-display text-primary crt-glow">
                      {formatRWF(totalShipping)}
                    </div>
                  </div>
                  <div className="border border-border bg-secondary/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Discounts given
                    </div>
                    <div className="mt-2 text-xl font-display text-primary crt-glow">
                      {formatRWF(totalDiscount)}
                    </div>
                  </div>
                  <div className="border border-border bg-secondary/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Units sold
                    </div>
                    <div className="mt-2 text-xl font-display text-primary crt-glow">
                      {totalUnitsSold.toLocaleString('en-US')}
                    </div>
                  </div>
                  <div className="border border-border bg-secondary/20 p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                      Fulfillment
                    </div>
                    <div className="mt-2 text-xl font-display text-primary crt-glow">
                      {formatPercentage(fulfillmentRate)}
                    </div>
                  </div>
                </div>

                <div className="mb-6 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="border border-border bg-secondary/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                          Incoming inbox
                        </div>
                        <div className="text-sm text-foreground">
                          {incomingOrders.length} active orders waiting on the team
                        </div>
                      </div>
                      <Badge className="tag uppercase">
                        {incomingOrders.filter((order) => ['pending', 'awaiting_payment', 'awaiting_confirmation'].includes(getStatusKey(order.status))).length} new
                      </Badge>
                    </div>
                    <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                      {incomingOrders.slice(0, 8).map((order) => {
                        const customer = customerLookup.get(order.user_id);
                        const items = parseOrderItems(order.items);
                        const firstItem = items[0]?.product_name || 'Order item';
                        const isUnread = ['pending', 'awaiting_payment', 'awaiting_confirmation'].includes(
                          getStatusKey(order.status)
                        );

                        return (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => setSelectedOrder(order)}
                            className={`w-full border p-3 text-left transition-colors ${
                              selectedOrder?.id === order.id
                                ? 'border-primary bg-primary/10'
                                : 'border-border bg-card/70 hover:border-primary/60'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-mono text-sm text-primary">#{order.id}</div>
                                  {isUnread && (
                                    <span className="tag border-accent/40 bg-accent/10 text-accent">
                                      NEW
                                    </span>
                                  )}
                                </div>
                                <div className="mt-1 truncate text-sm text-foreground">
                                  {customer?.display_name || customer?.email || 'Customer'}
                                </div>
                                <div className="mt-1 truncate text-xs text-muted-foreground">
                                  {firstItem}
                                </div>
                              </div>
                              <div className="text-right text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                {getStatusLabel(order.status)}
                              </div>
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              <span>{order.branch || '-'}</span>
                              <span>{formatShortDate(order.created_at)}</span>
                            </div>
                          </button>
                        );
                      })}
                      {incomingOrders.length === 0 && (
                        <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                          No incoming orders right now.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="border border-border bg-secondary/20 p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                          Quick actions
                        </div>
                        <div className="text-sm text-foreground">
                          {selectedOrder ? `Order #${selectedOrder.id}` : 'Select an order from the inbox'}
                        </div>
                      </div>
                      {selectedOrder && (
                        <Badge variant="outline" className={`uppercase tracking-[0.2em] ${getStatusTone(selectedOrder.status)}`}>
                          {getStatusLabel(selectedOrder.status)}
                        </Badge>
                      )}
                    </div>

                    {selectedOrder ? (
                      <div className="space-y-3">
                        <div className="grid gap-2 text-xs">
                          <div className="data-row">
                            <span className="label">CUSTOMER</span>
                            <span className="value">
                              {customerLookup.get(selectedOrder.user_id)?.display_name ||
                                customerLookup.get(selectedOrder.user_id)?.email ||
                                'Customer'}
                            </span>
                          </div>
                          <div className="data-row">
                            <span className="label">ROUTE</span>
                            <span className="value">
                              {selectedOrder.delivery_method === 'pickup'
                                ? `Self pickup @ ${selectedOrder.branch}`
                                : selectedOrder.delivery_option === 'delivery_by_delivery_guy'
                                  ? 'Delivery guy'
                                  : 'Branch delivery'}
                            </span>
                          </div>
                          <div className="data-row">
                            <span className="label">TOTAL</span>
                            <span className="value">{formatRWF(selectedOrder.total)}</span>
                          </div>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setSelectedOrder(selectedOrder)}
                          >
                            Open details
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleAdvanceOrder(selectedOrder, 'processing')}
                            disabled={busyOrderId === selectedOrder.id || !isBranchOperator}
                          >
                            Confirm payment
                          </Button>
                          <Button
                            type="button"
                            onClick={() => void handleAdvanceOrder(selectedOrder, 'shipped')}
                            disabled={
                              busyOrderId === selectedOrder.id ||
                              !(
                                isBranchOperator ||
                                (isDeliveryAgent && selectedOrder.assigned_delivery_agent_id === currentUserId)
                              )
                            }
                          >
                            Mark out for delivery
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => void handleAdvanceOrder(selectedOrder, 'delivered')}
                            disabled={
                              busyOrderId === selectedOrder.id ||
                              !(
                                isBranchOperator ||
                                (isDeliveryAgent && selectedOrder.assigned_delivery_agent_id === currentUserId)
                              )
                            }
                          >
                            Mark delivered
                          </Button>
                        </div>

                        <div className="border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground">
                          Gmail-style inbox keeps new orders at the top while delivery staff and branch
                          operators update payment, dispatch, and delivery status here.
                        </div>
                      </div>
                    ) : (
                      <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                        Pick an order to see its action panel.
                      </div>
                    )}
                  </div>
                </div>

                {loadingDashboard && recentOrders.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    Loading order feed...
                  </div>
                ) : recentOrders.length > 0 ? (
                  <div className="overflow-hidden border border-border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                          <TableHead className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Order
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Customer
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Branch
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Payment
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Status
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Total
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Placed
                          </TableHead>
                          <TableHead className="text-right text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Action
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentOrders.map((order) => {
                          const customer = customerLookup.get(order.user_id);

                          return (
                            <TableRow key={order.id} className="hover:bg-secondary/20">
                              <TableCell className="font-mono text-sm">
                                <div className="text-primary">#{order.id}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {order.tracking_number}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="min-w-[160px]">
                                  <div className="text-sm text-foreground">
                                    {customer?.display_name || customer?.email || 'Customer'}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground">
                                    {customer?.phone || order.phone || '-'}
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="text-sm text-foreground">{order.branch || '-'}</div>
                                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                  {order.delivery_method || '-'}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`uppercase tracking-[0.2em] ${getPaymentTone(order.payment_method)}`}
                                >
                                  {getPaymentLabel(order.payment_method)}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={`uppercase tracking-[0.2em] ${getStatusTone(order.status)}`}
                                >
                                  {getStatusLabel(order.status)}
                                </Badge>
                              </TableCell>
                              <TableCell className="font-semibold text-primary crt-glow">
                                {formatRWF(order.total)}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatShortDate(order.created_at)}
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setSelectedOrder(order)}
                                  className="gap-2"
                                >
                                  <Eye className="h-4 w-4" />
                                  View
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="border border-dashed border-border px-4 py-16 text-center text-sm text-muted-foreground">
                    No orders found for the selected branch and time window.
                  </div>
                )}
              </section>
              )}

              {activePanel === 'inventory' && (
              <section id="inventory" className="industrial-border bg-card/90 p-5 md:p-6">
                <SectionTitle
                  eyebrow="Inventory spotlight"
                  title="Products, promos, and watchlist"
                  subtitle="Keep the supermarket catalog visible with promos, best sellers, and stock watch items."
                  icon={Layers3}
                />

                <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    icon={Store}
                    label="Total SKUs"
                    value={catalogStats.total.toLocaleString('en-US')}
                    subtext="Catalog size across the store"
                  />
                  <MetricCard
                    icon={BadgePercent}
                    label="Promo items"
                    value={catalogStats.promoCount.toLocaleString('en-US')}
                    subtext="Discounted products live now"
                  />
                  <MetricCard
                    icon={PackageCheck}
                    label="In stock"
                    value={catalogStats.inStockCount.toLocaleString('en-US')}
                    subtext="Ready for checkout"
                  />
                  <MetricCard
                    icon={AlertTriangle}
                    label="Out of stock"
                    value={catalogStats.outOfStockCount.toLocaleString('en-US')}
                    subtext="Needs restocking attention"
                  />
                </div>

                <div className="mb-6 border border-border bg-secondary/20 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        Branch stock controls
                      </div>
                      <div className="text-sm text-foreground">
                        Adjust stock for {stockScopeLabel}
                      </div>
                      {branchFilter === 'all' && (
                        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          Select a branch above to edit stock. All branches shows aggregated inventory.
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {products.slice(0, 9).map((product) => {
                      const stock = getProductStockForBranch(product, branchFilter);

                      return (
                        <div key={product.id} className="border border-border bg-card/70 p-3">
                          <div className="text-sm text-foreground">{product.name}</div>
                          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {product.category}
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleAdjustStock(product, -1)}
                              disabled={busyProductId === product.id || branchFilter === 'all'}
                            >
                              -1
                            </Button>
                            <div className="text-lg font-display text-primary crt-glow">{stock}</div>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void handleAdjustStock(product, 1)}
                              disabled={busyProductId === product.id || branchFilter === 'all'}
                            >
                              +1
                            </Button>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-2">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              Branch update / edit
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingProduct(product)}
                            >
                              Edit
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {canCreateProducts && (
                  <ProductCreatePanel
                    actorRole={user?.role || 'customer'}
                    defaultBranch={currentProfile?.default_branch || (branchFilter === 'all' ? BRANCHES[0] : branchFilter)}
                    editingProduct={editingProduct}
                    onCancelEdit={() => setEditingProduct(null)}
                    onCreated={() => setRefreshTick((value) => value + 1)}
                  />
                )}

                <Tabs defaultValue="promos" className="space-y-4">
                  <TabsList className="w-full justify-start gap-2 border border-border bg-secondary/20 p-1">
                    <TabsTrigger value="promos" className="text-xs uppercase tracking-[0.2em]">
                      Hot promos
                    </TabsTrigger>
                    <TabsTrigger value="best" className="text-xs uppercase tracking-[0.2em]">
                      Best rated
                    </TabsTrigger>
                    <TabsTrigger value="watch" className="text-xs uppercase tracking-[0.2em]">
                      Watchlist
                    </TabsTrigger>
                    <TabsTrigger value="sales" className="text-xs uppercase tracking-[0.2em]">
                      Top sales
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="promos" className="space-y-3">
                    {promoProducts.length > 0 ? (
                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {promoProducts.map((product) => (
                          <MiniProductCard
                            key={product.id}
                            product={product}
                            badge={`-${product.discount}%`}
                            badgeTone="border-accent/30 bg-accent/10 text-accent"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
                        No discounted products right now.
                      </div>
                    )}
                  </TabsContent>

                  <TabsContent value="best" className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {bestRatedProducts.map((product) => (
                        <MiniProductCard
                          key={product.id}
                          product={product}
                          badge={`${product.rating.toFixed(1)}★`}
                          badgeTone="border-primary/30 bg-primary/10 text-primary"
                        />
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="watch" className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {watchlistProducts.map((product) => (
                        <MiniProductCard
                          key={product.id}
                          product={product}
                          badge={product.in_stock ? 'LOW RATING' : 'OOS'}
                          badgeTone={
                            product.in_stock
                              ? 'border-amber-400/30 bg-amber-500/10 text-amber-100'
                              : 'border-destructive/30 bg-destructive/10 text-destructive'
                          }
                        />
                      ))}
                    </div>
                  </TabsContent>

                  <TabsContent value="sales" className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {topProductsBySales.map((entry) => (
                        <div key={entry.product.id} className="card-industrial flex gap-3 p-3">
                          <div className="h-16 w-16 shrink-0 overflow-hidden border border-border bg-background p-1">
                            <img
                              src={entry.product.image}
                              alt={entry.product.name}
                              className="h-full w-full object-contain"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              {entry.product.category}
                            </div>
                            <div className="mt-1 truncate text-sm text-foreground">
                              {entry.product.name}
                            </div>
                            <div className="mt-2 flex items-end justify-between gap-2">
                              <div>
                                <div className="text-sm font-semibold text-primary crt-glow">
                                  {formatRWF(entry.revenue)}
                                </div>
                                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                  {entry.quantity} units sold
                                </div>
                              </div>
                              <Badge
                                variant="outline"
                                className="border-primary/30 bg-primary/10 uppercase tracking-[0.2em] text-primary"
                              >
                                <Flame className="h-3 w-3" />
                                Trending
                              </Badge>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              </section>
              )}

              {activePanel === 'roles' && (
              <section id="roles" className="space-y-6">
                <div className="industrial-border bg-card/90 p-5 md:p-6">
                  <SectionTitle
                    eyebrow="Access model"
                    title="Roles and permissions"
                    subtitle="Reference the store permissions flow: super admin, branch manager, branch staff, delivery agent, and customer."
                    icon={Shield}
                  />

                  <div className="mb-6">
                    <RoleInvitePanel
                      actorRole={user?.role || 'customer'}
                      defaultBranch={currentProfile?.default_branch || null}
                      profiles={profiles}
                      invitations={invitations}
                      onRefresh={() => setRefreshTick((value) => value + 1)}
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                    {STORE_ROLE_CARDS.map((role) => (
                      <div
                        key={role.key}
                        className={`relative overflow-hidden border border-border bg-gradient-to-br ${role.panelClass} p-4`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <Badge
                              variant="outline"
                              className={`uppercase tracking-[0.2em] ${role.badgeClass}`}
                            >
                              {role.description}
                            </Badge>
                            <div className="mt-3 text-lg font-display text-foreground">
                              {role.label}
                            </div>
                          </div>
                          {role.key === roleMeta.key && (
                            <Badge className="tag uppercase">current</Badge>
                          )}
                        </div>
                        <div className="mt-3 text-xs text-muted-foreground">
                          {role.scope}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="industrial-border bg-card/90 p-5 md:p-6">
                  <SectionTitle
                    eyebrow="Permission matrix"
                    title="Dashboard access levels"
                    subtitle="How store actions are split across the five roles in the permission flow."
                    icon={Users}
                  />

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-secondary/20 hover:bg-secondary/20">
                          <TableHead className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            Permission
                          </TableHead>
                          {STORE_ROLE_CARDS.map((role) => (
                            <TableHead
                              key={role.key}
                              className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground"
                            >
                              {role.label}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {PERMISSION_ROWS.map((row) => (
                          <TableRow key={row.label} className="hover:bg-secondary/20">
                            <TableCell className="font-medium text-foreground">
                              {row.label}
                            </TableCell>
                            {STORE_ROLE_CARDS.map((role) => {
                              const value = row[role.key];
                              return (
                                <TableCell key={`${row.label}-${role.key}`}>
                                  <Badge
                                    variant="outline"
                                    className={`uppercase tracking-[0.2em] ${getPermissionTone(value)}`}
                                  >
                                    {getPermissionLabel(value)}
                                  </Badge>
                                </TableCell>
                              );
                            })}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  {[
                    {
                      icon: MapPin,
                      title: 'Branch isolation',
                      body: 'Branch managers and staff should see only their own store scope. Keep filters and backend guards aligned.',
                    },
                    {
                      icon: Activity,
                      title: 'Authenticated access',
                      body: 'Dashboard access is tied to Firebase auth plus the session token exchange already in the project.',
                    },
                    {
                      icon: Shield,
                      title: 'Audit-ready actions',
                      body: 'Promotions, inventory, status changes, and refunds should be logged as the next backend step.',
                    },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.title} className="industrial-border bg-card/90 p-4">
                        <Icon className="h-5 w-5 text-primary" />
                        <div className="mt-3 text-sm font-display text-primary">
                          {item.title}
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground">{item.body}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
              )}
            </div>
          </div>
        </div>
      </main>

      {selectedOrder && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className="industrial-border max-h-[90vh] w-full max-w-3xl overflow-y-auto bg-card p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Order detail
                </div>
                <h3 className="mt-1 text-2xl font-display text-primary crt-glow">
                  #{selectedOrder.id}
                </h3>
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedOrder(null)}
                className="gap-2"
              >
                Close
              </Button>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="data-row">
                <span className="label">STATUS</span>
                <span className="value">{getStatusLabel(selectedOrder.status)}</span>
              </div>
              <div className="data-row">
                <span className="label">PAYMENT</span>
                <span className="value">{getPaymentLabel(selectedOrder.payment_method)}</span>
              </div>
              <div className="data-row">
                <span className="label">BRANCH</span>
                <span className="value">{selectedOrder.branch || '-'}</span>
              </div>
              <div className="data-row">
                <span className="label">PLACED</span>
                <span className="value">{formatShortDate(selectedOrder.created_at)}</span>
              </div>
              <div className="data-row">
                <span className="label">CUSTOMER</span>
                <span className="value">
                  {selectedOrderCustomer?.display_name ||
                    selectedOrderCustomer?.email ||
                    'Customer'}
                </span>
              </div>
              <div className="data-row">
                <span className="label">PHONE</span>
                <span className="value">{selectedOrder.phone || '-'}</span>
              </div>
              <div className="data-row">
                <span className="label">ADDRESS</span>
                <span className="value">{selectedOrder.address || '-'}</span>
              </div>
              <div className="data-row">
                <span className="label">TRACKING</span>
                <span className="value">{selectedOrder.tracking_number || '-'}</span>
              </div>
            </div>

            <div className="mt-6 grid gap-4 border-t border-border pt-4 lg:grid-cols-2">
              <div className="border border-border bg-secondary/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Branch assignment
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  {getBranchDetails(selectedOrder.branch || '')?.address || selectedOrder.branch || '-'}
                </div>
                <select
                  value={assignmentDrafts[selectedOrder.id] || selectedOrder.assigned_staff_id || ''}
                  onChange={(event) =>
                    setAssignmentDrafts((current) => ({
                      ...current,
                      [selectedOrder.id]: event.target.value,
                    }))
                  }
                  className="mt-3 w-full border border-border bg-input p-2 text-xs"
                >
                  <option value="">Select branch staff</option>
                  {branchStaffProfiles
                    .filter(
                      (profile) =>
                        !selectedOrder.branch ||
                        !profile.default_branch ||
                        normalizeText(profile.default_branch) === normalizeText(selectedOrder.branch)
                    )
                    .map((profile) => (
                      <option key={profile.user_id} value={profile.user_id}>
                        {profile.display_name || profile.email}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  className="mt-3 w-full"
                  onClick={() => void handleAssignStaff(selectedOrder)}
                  disabled={busyOrderId === selectedOrder.id}
                >
                  Assign staff
                </Button>
              </div>

              <div className="border border-border bg-secondary/20 p-4">
                <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Delivery assignment
                </div>
                <div className="mt-3 text-xs text-muted-foreground">
                  Assign a delivery agent when the order is ready to leave the branch.
                </div>
                <select
                  value={deliveryDrafts[selectedOrder.id] || selectedOrder.assigned_delivery_agent_id || ''}
                  onChange={(event) =>
                    setDeliveryDrafts((current) => ({
                      ...current,
                      [selectedOrder.id]: event.target.value,
                    }))
                  }
                  className="mt-3 w-full border border-border bg-input p-2 text-xs"
                >
                  <option value="">Select delivery agent</option>
                  {deliveryProfiles
                    .filter(
                      (profile) =>
                        !selectedOrder.branch ||
                        !profile.default_branch ||
                        normalizeText(profile.default_branch) === normalizeText(selectedOrder.branch)
                    )
                    .map((profile) => (
                      <option key={profile.user_id} value={profile.user_id}>
                        {profile.display_name || profile.email}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => void handleAssignDelivery(selectedOrder)}
                  disabled={busyOrderId === selectedOrder.id}
                >
                  Assign delivery
                </Button>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleAdvanceOrder(selectedOrder, 'processing')}
                disabled={busyOrderId === selectedOrder.id || !isBranchOperator}
              >
                Mark processing
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleAdvanceOrder(selectedOrder, 'shipped')}
                disabled={
                  busyOrderId === selectedOrder.id ||
                  !(
                    isBranchOperator ||
                    (isDeliveryAgent && selectedOrder.assigned_delivery_agent_id === currentUserId)
                  )
                }
              >
                Mark out for delivery
              </Button>
              <Button
                type="button"
                onClick={() => void handleAdvanceOrder(selectedOrder, 'delivered')}
                disabled={
                  busyOrderId === selectedOrder.id ||
                  !(
                    isBranchOperator ||
                    (isDeliveryAgent && selectedOrder.assigned_delivery_agent_id === currentUserId)
                  )
                }
              >
                Mark delivered
              </Button>
            </div>

            <div className="mt-6">
              <div className="mb-3 flex items-center gap-2 text-sm font-display text-primary">
                <ShoppingBag className="h-4 w-4" />
                ITEMS
              </div>
              <div className="space-y-2">
                {selectedOrderItems.map((item) => (
                  <div
                    key={`${item.product_id}-${item.product_name}`}
                    className="flex gap-3 border border-border bg-secondary/20 p-3"
                  >
                    <div className="h-14 w-14 shrink-0 border border-border bg-background p-1">
                      <img
                        src={item.image || '/android-chrome-192x192.png'}
                        alt={item.product_name}
                        className="h-full w-full object-contain"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-foreground">{item.product_name}</div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Qty {item.quantity} at {formatRWF(item.price)}
                      </div>
                    </div>
                    <div className="shrink-0 text-sm font-semibold text-primary crt-glow">
                      {formatRWF((Number(item.price) || 0) * (Number(item.quantity) || 0))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <div className="data-row">
                <span className="label">SUBTOTAL</span>
                <span className="value">{formatRWF(selectedOrder.subtotal || 0)}</span>
              </div>
              <div className="data-row">
                <span className="label">SHIPPING</span>
                <span className="value">{formatRWF(selectedOrder.shipping || 0)}</span>
              </div>
              {Number(selectedOrder.discount) > 0 && (
                <div className="data-row">
                  <span className="label">DISCOUNT</span>
                  <span className="value text-accent">
                    -{formatRWF(selectedOrder.discount || 0)}
                  </span>
                </div>
              )}
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
                  Total
                </span>
                <span className="text-2xl font-display text-primary crt-glow">
                  {formatRWF(selectedOrder.total)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
