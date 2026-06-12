import type { AccessRole } from './store-roles';

export type AccessPermission =
  | '*'
  | 'shop:view'
  | 'cart:view'
  | 'checkout:start'
  | 'account:view'
  | 'dashboard:view'
  | 'orders:view_own'
  | 'orders:view_branch'
  | 'orders:view_assigned'
  | 'orders:update_branch'
  | 'orders:update_assigned'
  | 'products:view'
  | 'products:create'
  | 'products:update'
  | 'users:manage'
  | 'deliveries:view';

export type AccessSubject = {
  accessRole?: AccessRole | string | null;
  isSuspended?: boolean;
} | AccessRole | string | null | undefined;

const ROLE_PERMISSIONS: Record<AccessRole, AccessPermission[]> = {
  guest: ['shop:view', 'cart:view', 'products:view'],
  customer: ['shop:view', 'cart:view', 'checkout:start', 'account:view', 'orders:view_own', 'products:view'],
  branch_staff: [
    'shop:view',
    'cart:view',
    'checkout:start',
    'account:view',
    'dashboard:view',
    'orders:view_branch',
    'orders:update_branch',
    'products:view',
    'products:create',
    'products:update',
  ],
  branch_manager: [
    'shop:view',
    'cart:view',
    'checkout:start',
    'account:view',
    'dashboard:view',
    'orders:view_branch',
    'orders:update_branch',
    'products:view',
    'products:create',
    'products:update',
  ],
  delivery_agent: [
    'shop:view',
    'cart:view',
    'checkout:start',
    'account:view',
    'dashboard:view',
    'orders:view_assigned',
    'orders:update_assigned',
    'products:view',
    'deliveries:view',
  ],
  super_admin: ['*'],
};

function normalizeRole(subject: AccessSubject): AccessRole {
  const rawRole =
    typeof subject === 'object' && subject !== null
      ? subject.accessRole
      : subject;
  const normalized = String(rawRole || 'guest').trim().toLowerCase().replace(/[\s-]+/g, '_');

  switch (normalized) {
    case 'super_admin':
    case 'branch_manager':
    case 'branch_staff':
    case 'delivery_agent':
    case 'customer':
    case 'guest':
      return normalized;
    default:
      return 'customer';
  }
}

function isSuspended(subject: AccessSubject): boolean {
  return typeof subject === 'object' && subject !== null && subject.isSuspended === true;
}

export function getPermissionsForRole(role: AccessRole | string | null | undefined): AccessPermission[] {
  return ROLE_PERMISSIONS[normalizeRole(role)] || ROLE_PERMISSIONS.guest;
}

export function canAccess(
  subject: AccessSubject,
  permission: AccessPermission
): boolean {
  if (isSuspended(subject)) {
    return permission === 'shop:view' || permission === 'products:view';
  }

  const permissions = getPermissionsForRole(normalizeRole(subject));
  return permissions.includes('*') || permissions.includes(permission);
}

export function canAccessRoute(subject: AccessSubject, pathname: string): boolean {
  if (pathname.startsWith('/admin')) {
    return canAccess(subject, 'dashboard:view');
  }

  if (pathname.startsWith('/account')) {
    return canAccess(subject, 'account:view');
  }

  if (pathname.startsWith('/checkout')) {
    return canAccess(subject, 'checkout:start');
  }

  return true;
}
