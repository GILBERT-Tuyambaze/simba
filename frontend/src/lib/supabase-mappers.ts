import type { Order, UserProfile } from './types';
import { normalizeStoreRole } from './store-roles';

type RelationName = { name?: string | null } | null;

export function getRelationName(value: RelationName | RelationName[] | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  const relation = Array.isArray(value) ? value[0] : value;
  return relation?.name || null;
}

export function mapSupabaseOrder(row: any): Order {
  const items = Array.isArray(row.order_items)
    ? row.order_items.map((item: any) => ({
        product_id: Number(item.product_id || 0),
        product_name: item.product_name,
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 0),
        image: item.image || '',
        unit: item.unit || '',
      }))
    : [];

  const branch = (row.branches || row.branch) as RelationName | string | null;
  const assignedBranch = (row.assigned_branch || row.assigned_branches) as RelationName | string | null;
  const reviewBranch = (row.review_branch || row.review_branches) as RelationName | string | null;

  const branchName = getRelationName(branch) || '';
  const assignedBranchName = getRelationName(assignedBranch) || branchName;
  const reviewBranchName = getRelationName(reviewBranch) || branchName;

  return {
    id: Number(row.id),
    user_id: String(row.user_id || ''),
    customer_name: row.customer_name || '',
    branch: branchName,
    assigned_branch: assignedBranchName,
    items: typeof row.items === 'string'
      ? row.items
      : row.items
        ? JSON.stringify(row.items)
        : JSON.stringify(items),
    subtotal: Number(row.subtotal || 0),
    shipping: Number(row.shipping || 0),
    discount: Number(row.discount || 0),
    deposit_amount: Number(row.deposit_amount || 0),
    total: Number(row.total || 0),
    delivery_method: row.delivery_method || 'delivery',
    delivery_option: row.delivery_option || null,
    address: row.address || '',
    phone: row.phone || '',
    payment_method: row.payment_method || 'mtn_momo',
    status: row.status || 'pending',
    tracking_number: row.tracking_number || '',
    assigned_staff_id: row.assigned_staff_id || null,
    assigned_staff_name: row.assigned_staff?.display_name || null,
    assigned_delivery_agent_id: row.assigned_delivery_agent_id || null,
    assigned_delivery_agent_name: row.assigned_delivery_agent?.display_name || null,
    pickup_time: row.pickup_time || null,
    rating: row.rating ?? null,
    review_comment: row.review_comment || null,
    review_branch: reviewBranchName,
    timeline: Array.isArray(row.timeline) ? row.timeline : [],
    created_at: row.created_at || '',
  };
}

export function mapSupabaseProfile(row: any): UserProfile {
  return {
    id: row.id ?? row.user_id,
    user_id: String(row.user_id || ''),
    display_name: row.display_name || '',
    phone: row.phone || '',
    email: row.email || '',
    role: normalizeStoreRole(row.role),
    default_branch: getRelationName(row.branches) || row.default_branch || '',
    addresses: typeof row.addresses === 'string' ? row.addresses : JSON.stringify(row.addresses || []),
    preferred_payment_method: row.preferred_payment_method || null,
    no_show_flags: Number(row.no_show_flags || 0),
    created_at: row.created_at || '',
  };
}

export function parseAddresses(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return [trimmed];
  }
}
