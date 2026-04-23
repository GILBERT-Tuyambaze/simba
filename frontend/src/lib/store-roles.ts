export type StoreRoleKey =
  | 'super_admin'
  | 'branch_manager'
  | 'branch_staff'
  | 'delivery_agent'
  | 'customer';

export type StoreRoleMeta = {
  key: StoreRoleKey;
  label: string;
  description: string;
  scope: string;
  badgeClass: string;
  panelClass: string;
};

export type PermissionRow = {
  label: string;
  super_admin: string;
  branch_manager: string;
  branch_staff: string;
  delivery_agent: string;
  customer: string;
};

const ROLE_ALIASES: Record<string, StoreRoleKey> = {
  admin: 'super_admin',
  super_admin: 'super_admin',
  superadmin: 'super_admin',
  manager: 'branch_manager',
  branch_manager: 'branch_manager',
  branchmanager: 'branch_manager',
  staff: 'branch_staff',
  branch_staff: 'branch_staff',
  branchstaff: 'branch_staff',
  delivery: 'delivery_agent',
  delivery_agent: 'delivery_agent',
  deliveryagent: 'delivery_agent',
  courier: 'delivery_agent',
  customer: 'customer',
  user: 'customer',
};

export const STORE_ROLE_CARDS: StoreRoleMeta[] = [
  {
    key: 'super_admin',
    label: 'Super admin',
    description: 'Full system access',
    scope: 'All branches, inventory, orders, roles, and payments',
    badgeClass: 'bg-violet-500/20 text-violet-100 border-violet-400/30',
    panelClass: 'from-violet-500/20 to-indigo-500/20',
  },
  {
    key: 'branch_manager',
    label: 'Branch manager',
    description: 'Own branch only',
    scope: 'Branch inventory, branch orders, branch staff, and promos',
    badgeClass: 'bg-blue-500/20 text-blue-100 border-blue-400/30',
    panelClass: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    key: 'branch_staff',
    label: 'Branch staff',
    description: 'Ops + stock ops',
    scope: 'Shelf updates, stock counts, order handling, and local product edits',
    badgeClass: 'bg-emerald-500/20 text-emerald-100 border-emerald-400/30',
    panelClass: 'from-emerald-500/20 to-teal-500/20',
  },
  {
    key: 'delivery_agent',
    label: 'Delivery agent',
    description: 'Assigned orders',
    scope: 'Assigned deliveries, branch pickups, and delivery status updates',
    badgeClass: 'bg-amber-500/20 text-amber-100 border-amber-400/30',
    panelClass: 'from-amber-500/20 to-orange-500/20',
  },
  {
    key: 'customer',
    label: 'Customer',
    description: 'Shop + track',
    scope: 'Browse catalog, place orders, and track delivery',
    badgeClass: 'bg-zinc-500/20 text-zinc-100 border-zinc-400/30',
    panelClass: 'from-zinc-500/20 to-slate-500/20',
  },
];

export const PERMISSION_ROWS: PermissionRow[] = [
  {
    label: 'Add product / manage inventory',
    super_admin: 'all',
    branch_manager: 'branch',
    branch_staff: 'branch',
    delivery_agent: '-',
    customer: '-',
  },
  {
    label: 'View all orders',
    super_admin: 'all',
    branch_manager: 'branch',
    branch_staff: 'branch',
    delivery_agent: 'assigned',
    customer: 'own',
  },
  {
    label: 'Manage branch staff',
    super_admin: 'all',
    branch_manager: 'branch',
    branch_staff: '-',
    delivery_agent: '-',
    customer: '-',
  },
  {
    label: 'Invite roles',
    super_admin: 'all',
    branch_manager: 'branch',
    branch_staff: 'branch',
    delivery_agent: 'assigned',
    customer: '-',
  },
  {
    label: 'Pricing & promotions',
    super_admin: 'all',
    branch_manager: 'branch',
    branch_staff: '-',
    delivery_agent: '-',
    customer: '-',
  },
  {
    label: 'Analytics & reports',
    super_admin: 'all',
    branch_manager: 'branch',
    branch_staff: '-',
    delivery_agent: '-',
    customer: '-',
  },
  {
    label: 'Approve order status',
    super_admin: 'all',
    branch_manager: 'branch',
    branch_staff: 'branch',
    delivery_agent: 'assigned',
    customer: '-',
  },
  {
    label: 'Process payment / refund',
    super_admin: 'all',
    branch_manager: 'branch',
    branch_staff: '-',
    delivery_agent: '-',
    customer: '-',
  },
  {
    label: 'Shop + place orders',
    super_admin: 'yes',
    branch_manager: 'yes',
    branch_staff: 'yes',
    delivery_agent: 'yes',
    customer: 'yes',
  },
];

const PRODUCT_MANAGER_ROLES: StoreRoleKey[] = ['super_admin', 'branch_manager', 'branch_staff'];

const ROLE_INVITE_RULES: Record<StoreRoleKey, StoreRoleKey[]> = {
  super_admin: ['super_admin', 'branch_manager', 'branch_staff', 'delivery_agent', 'customer'],
  branch_manager: ['branch_staff', 'delivery_agent', 'customer'],
  branch_staff: ['customer'],
  delivery_agent: ['delivery_agent', 'customer'],
  customer: [],
};

export function normalizeStoreRole(role?: string | null): StoreRoleKey {
  const normalized = (role || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return ROLE_ALIASES[normalized] || 'customer';
}

export function getStoreRoleMeta(role?: string | null): StoreRoleMeta {
  const normalized = normalizeStoreRole(role);
  return (
    STORE_ROLE_CARDS.find((item) => item.key === normalized) ||
    STORE_ROLE_CARDS[STORE_ROLE_CARDS.length - 1]
  );
}

export function canAccessDashboard(role?: string | null): boolean {
  return normalizeStoreRole(role) !== 'customer';
}

export function canManageProducts(role?: string | null): boolean {
  return PRODUCT_MANAGER_ROLES.includes(normalizeStoreRole(role));
}

export function getAssignableRoles(role?: string | null): StoreRoleKey[] {
  return ROLE_INVITE_RULES[normalizeStoreRole(role)] || [];
}

export function canInviteRole(role?: string | null, targetRole?: string | null): boolean {
  return getAssignableRoles(role).includes(normalizeStoreRole(targetRole));
}

export function canUpdateExistingRoles(role?: string | null): boolean {
  return normalizeStoreRole(role) === 'super_admin';
}
