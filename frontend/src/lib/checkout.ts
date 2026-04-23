import { getAPIBaseURL } from './config';
import { getStoredSessionToken } from './auth';
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

function getHeaders(): HeadersInit {
  const token = getStoredSessionToken();
  if (!token) {
    throw new Error('You must be signed in to checkout.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
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
  const response = await fetch(`${getAPIBaseURL()}/api/v1/payment/create_payment_session`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  return parseJson<CreatePaymentSessionResponse>(response);
}

export async function verifyPaymentSession(
  sessionId: string
): Promise<VerifyPaymentResponse> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/payment/verify_payment`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ session_id: sessionId }),
  });

  return parseJson<VerifyPaymentResponse>(response);
}

export async function cancelOrder(orderId: number): Promise<CancelOrderResponse> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/entities/orders/${orderId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({
      status: 'cancelled',
    }),
  });

  return parseJson<CancelOrderResponse>(response);
}
