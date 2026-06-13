import { resolveBranchId } from './branches';
import { mapSupabaseOrder, mapSupabaseProfile, parseAddresses } from './supabase-mappers';
import { getSupabaseUser, supabase } from './supabase';
import type { CheckoutPaymentMethod } from './checkout';
import type { Order, UserProfile } from './types';

export type AccountProfileRecord = UserProfile & {
  preferred_payment_method?: string | null;
};

export type AccountProfileDraft = {
  display_name: string;
  phone: string;
  email: string;
  default_branch: string;
  addresses: string;
  preferred_payment_method: CheckoutPaymentMethod;
};

const ORDER_SELECT = `
  *,
  branches:branch_id(name),
  assigned_branch:assigned_branch_id(name),
  review_branch:review_branch_id(name),
  order_items(*)
`;

async function requireUserId(): Promise<string> {
  const { user, error } = await getSupabaseUser();
  if (error || !user) {
    throw new Error('You must be signed in.');
  }
  return user.id;
}

export async function fetchAccountOrders(): Promise<Order[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .eq('user_id', userId)
    .order('id', { ascending: false })
    .limit(50);

  if (error) {
    throw error;
  }

  const mapped = (data || []).map(mapSupabaseOrder);
  const mappedOne = mapped.find((o) => Number(o.id) === 1);
  if (mappedOne) {
    // No temporary audit log retained
  }

  return mapped;
}

export async function fetchAccountProfile(): Promise<AccountProfileRecord | null> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .select('*, branches:default_branch_id(name)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ? mapSupabaseProfile(data) : null;
}

export async function saveAccountProfile(
  payload: AccountProfileDraft,
  _profileId?: number | string | null
): Promise<AccountProfileRecord> {
  const userId = await requireUserId();
  const defaultBranchId = await resolveBranchId(payload.default_branch);

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        user_id: userId,
        display_name: payload.display_name,
        phone: payload.phone,
        email: payload.email,
        default_branch_id: defaultBranchId,
        addresses: parseAddresses(payload.addresses),
        preferred_payment_method: payload.preferred_payment_method,
      },
      { onConflict: 'user_id' }
    )
    .select('*, branches:default_branch_id(name)')
    .single();

  if (error) {
    throw error;
  }

  return mapSupabaseProfile(data);
}

export async function updateAccountOrder(
  orderId: number,
  payload: Partial<Order>
): Promise<Order> {
  const updatePayload: Record<string, unknown> = {};
  if (payload.status) updatePayload.status = payload.status;
  if (typeof payload.rating === 'number') updatePayload.rating = payload.rating;
  if (payload.review_comment !== undefined) updatePayload.review_comment = payload.review_comment;
  if (payload.review_branch) updatePayload.review_branch_id = await resolveBranchId(payload.review_branch);

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
