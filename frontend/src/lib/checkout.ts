import { mapSupabaseOrder } from './supabase-mappers';
import { supabase } from './supabase';
import type { CartItem, Order } from './types';

export type CheckoutDeliveryMethod = 'delivery' | 'pickup';
export type CheckoutPaymentMethod = 'card' | 'mtn_momo' | 'airtel_money' | 'cash_on_delivery';

export type CheckoutItem = Pick<
  CartItem,
  'product_id' | 'product_name' | 'price' | 'image' | 'unit'
> & {
  quantity: number;
};

export type CreatePaymentSessionRequest = {
  items: CheckoutItem[];
  branch: string;
  customer_name: string;
  phone: string;
  address?: string;
  delivery_method: CheckoutDeliveryMethod;
  delivery_option?: 'delivery_by_branch' | 'delivery_by_delivery_guy' | 'self_pickup';
  delivery_agent_id?: string;
  pickup_time?: string;
  payment_method: CheckoutPaymentMethod;
  promo_code?: string | null;
  success_url?: string;
  cancel_url?: string;
  currency?: string;
  allow_partial_fulfillment?: boolean;
};

export type CreatePaymentSessionResponse = {
  order_id: number;
  tracking_number: string;
  status: string;
  payment_method: string;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  deposit_amount?: number;
  pickup_time?: string | null;
  session_id?: string | null;
  url?: string | null;
  message: string;
};

export type VerifyPaymentResponse = {
  order_id: number;
  tracking_number: string;
  status: string;
  payment_status: string;
  total: number;
};

export type CancelOrderResponse = Order;

async function getHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  if (!data.session?.access_token) {
    throw new Error('You must be signed in to checkout.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.session.access_token}`,
  };
}

async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = await response.json();
    if (typeof body?.detail === 'string') {
      return body.detail;
    }
  } catch {
    return null;
  }

  return null;
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(detail || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function createPaymentSession(
  payload: CreatePaymentSessionRequest
): Promise<CreatePaymentSessionResponse> {
  const response = await fetch('/api/payment/create-session', {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify(payload),
  });

  return parseJson<CreatePaymentSessionResponse>(response);
}

export async function verifyPaymentSession(
  sessionId: string
): Promise<VerifyPaymentResponse> {
  const response = await fetch('/api/payment/verify', {
    method: 'POST',
    headers: await getHeaders(),
    body: JSON.stringify({ session_id: sessionId }),
  });

  return parseJson<VerifyPaymentResponse>(response);
}

export async function cancelOrder(orderId: number): Promise<CancelOrderResponse> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status: 'cancelled' })
    .eq('id', orderId)
    .select('*, branches:branch_id(name), assigned_branch:assigned_branch_id(name), review_branch:review_branch_id(name), order_items(*)')
    .single();

  if (error) {
    throw error;
  }

  return mapSupabaseOrder(data);
}
