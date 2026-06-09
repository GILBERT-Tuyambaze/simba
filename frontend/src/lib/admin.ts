import { resolveBranchId } from './branches';
import { getRelationName, mapSupabaseOrder, mapSupabaseProfile } from './supabase-mappers';
import { supabase } from './supabase';
import type { Invitation, Order, Product, UserProfile } from './types';

type ProductNumberListField =
  | 'upsells'
  | 'cross_sells'
  | 'related_products'
  | 'recommended_products'
  | 'similar_products'
  | 'frequently_bought_together';

type AdminProductPayload = Omit<Partial<Product>, ProductNumberListField | 'attributes' | 'variations'> & {
  attributes?: Product['attributes'] | Record<string, unknown> | string;
  variations?: Product['variations'] | unknown[] | string;
  upsells?: number[] | string;
  cross_sells?: number[] | string;
  related_products?: number[] | string;
  recommended_products?: number[] | string;
  similar_products?: number[] | string;
  frequently_bought_together?: number[] | string;
};

const ORDER_SELECT = `
  *,
  branches:branch_id(name),
  assigned_branch:assigned_branch_id(name),
  review_branch:review_branch_id(name),
  assigned_staff:assigned_staff_id(display_name),
  assigned_delivery_agent:assigned_delivery_agent_id(display_name),
  order_items(*)
`;

async function parseApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = await response.json();
      detail = typeof body?.detail === 'string' ? body.detail : null;
    } catch {
      detail = null;
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

async function getAuthHeader(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
}

export async function fetchAdminOrders(limit = 500): Promise<Order[]> {
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).map(mapSupabaseOrder);
}

export async function fetchAdminProfiles(limit = 500): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, branches:default_branch_id(name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).map(mapSupabaseProfile);
}

export async function updateAdminOrder(
  orderId: number,
  payload: Partial<Order>
): Promise<Order> {
  const updatePayload: Record<string, unknown> = {};
  if (payload.status) updatePayload.status = payload.status;
  if (payload.assigned_branch) updatePayload.assigned_branch_id = await resolveBranchId(payload.assigned_branch);
  if (payload.branch) updatePayload.branch_id = await resolveBranchId(payload.branch);
  if (payload.assigned_staff_id !== undefined) updatePayload.assigned_staff_id = payload.assigned_staff_id || null;
  if (payload.assigned_delivery_agent_id !== undefined) {
    updatePayload.assigned_delivery_agent_id = payload.assigned_delivery_agent_id || null;
  }
  if (payload.pickup_time !== undefined) updatePayload.pickup_time = payload.pickup_time || null;
  if (payload.rating !== undefined) updatePayload.rating = payload.rating;
  if (payload.review_comment !== undefined) updatePayload.review_comment = payload.review_comment;

  const { data, error } = await supabase
    .from('orders')
    .update(updatePayload)
    .eq('id', orderId)
    .select(ORDER_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return mapSupabaseOrder(data);
}

export async function updateAdminProduct(
  productId: number,
  payload: AdminProductPayload
): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .update(toProductMutation(payload))
    .eq('id', productId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  await upsertProductInventory(data.id, payload);
  return hydrateProduct(data.id);
}

export async function createAdminProduct(payload: AdminProductPayload): Promise<Product> {
  const { data, error } = await supabase
    .from('products')
    .insert(toProductMutation(payload))
    .select()
    .single();

  if (error) {
    throw error;
  }

  await upsertProductInventory(data.id, payload);
  return hydrateProduct(data.id);
}

export async function fetchAdminInvitations(): Promise<Invitation[]> {
  const { data, error } = await supabase
    .from('invitations')
    .select('*, branches:branch_id(name)')
    .order('id', { ascending: false });

  if (error) {
    throw error;
  }

  return (data || []).map((item: any) => ({
    id: item.id,
    token: item.token,
    role: item.role,
    branch: getRelationName(item.branches),
    invited_email: item.invited_email,
    note: item.note,
    status: item.status,
    expires_at: item.expires_at,
    created_at: item.created_at,
  }));
}

export async function createRoleInvitation(payload: {
  role: string;
  branch?: string | null;
  invited_email?: string | null;
  note?: string | null;
  expires_in_days?: number;
}): Promise<Invitation> {
  const response = await fetch('/api/invitations', {
    method: 'POST',
    headers: {
      ...(await getAuthHeader()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse<Invitation>(response);
}

export async function updateAdminUserRole(
  userId: string,
  payload: { role: string; branch?: string | null }
): Promise<{ id: string; role: string; email: string; name?: string | null }> {
  const response = await fetch(`/api/admin/roles/${encodeURIComponent(userId)}`, {
    method: 'PUT',
    headers: {
      ...(await getAuthHeader()),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseApiResponse<{ id: string; role: string; email: string; name?: string | null }>(response);
}

function toProductMutation(payload: AdminProductPayload): Record<string, unknown> {
  return compactMutation({
    name: payload.name,
    price: payload.price,
    category: payload.category,
    subcategory_id: payload.subcategory_id,
    image: payload.image,
    unit: payload.unit,
    description: payload.description,
    brand: payload.brand,
    rating: payload.rating,
    discount: payload.discount,
    tags: Array.isArray(payload.tags) ? payload.tags : parseStringArray(payload.tags),
    attributes: typeof payload.attributes === 'string' ? safeJson(payload.attributes, {}) : payload.attributes,
    variations: typeof payload.variations === 'string' ? safeJson(payload.variations, []) : payload.variations,
    options: Array.isArray(payload.options) ? payload.options : parseStringArray(payload.options),
    addons: Array.isArray(payload.addons) ? payload.addons : parseStringArray(payload.addons),
    modifiers: Array.isArray(payload.modifiers) ? payload.modifiers : parseStringArray(payload.modifiers),
    upsells: parseNumberArray(payload.upsells),
    cross_sells: parseNumberArray(payload.cross_sells),
    related_products: parseNumberArray(payload.related_products),
    recommended_products: parseNumberArray(payload.recommended_products),
    similar_products: parseNumberArray(payload.similar_products),
    frequently_bought_together: parseNumberArray(payload.frequently_bought_together),
    best_seller: payload.best_seller,
    new_arrival: payload.new_arrival,
    featured: payload.featured,
    on_sale: payload.on_sale,
    backorder: payload.backorder,
    pre_order: payload.pre_order,
    discontinued: payload.discontinued,
  });
}

async function upsertProductInventory(productId: number, payload: AdminProductPayload): Promise<void> {
  const stockByBranch = parseBranchStock(payload.branch_stock);
  const selectedBranch = payload.branch?.trim();

  if (selectedBranch && payload.stock_count !== undefined) {
    stockByBranch[selectedBranch] = Math.max(Number(payload.stock_count) || 0, 0);
  }

  const rows = [];
  for (const [branch, stockCount] of Object.entries(stockByBranch)) {
    const branchId = await resolveBranchId(branch);
    if (!branchId) {
      continue;
    }

    rows.push(
      compactMutation({
        product_id: productId,
        branch_id: branchId,
        stock_count: Math.max(Number(stockCount) || 0, 0),
        available_for_delivery: payload.available_for_delivery ?? true,
      })
    );
  }

  if (!rows.length) {
    return;
  }

  const { error } = await supabase
    .from('product_inventory')
    .upsert(rows, { onConflict: 'product_id,branch_id' });

  if (error) {
    throw error;
  }
}

async function hydrateProduct(productId: number): Promise<Product> {
  const { data, error } = await supabase
    .from('product_catalog')
    .select('*')
    .eq('id', productId)
    .single();
  if (error) {
    throw error;
  }
  return data as Product;
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean);
  }
  if (typeof value !== 'string') {
    return [];
  }
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseNumberArray(value: unknown): number[] {
  if (Array.isArray(value)) {
    return value.map(Number).filter((item) => Number.isFinite(item));
  }
  if (typeof value !== 'string') {
    return [];
  }
  const parsed = safeJson(value, null);
  if (Array.isArray(parsed)) {
    return parsed.map(Number).filter((item) => Number.isFinite(item));
  }
  return value
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function parseBranchStock(value: Product['branch_stock']): Record<string, number> {
  if (!value) {
    return {};
  }
  if (typeof value === 'string') {
    const parsed = safeJson(value, {});
    return isNumberMap(parsed) ? parsed : {};
  }
  return isNumberMap(value) ? value : {};
}

function isNumberMap(value: unknown): value is Record<string, number> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function compactMutation(payload: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
  );
}

function safeJson(value: string, fallback: unknown): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}
