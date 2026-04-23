import { getAPIBaseURL } from './config';
import { getStoredSessionToken } from './auth';
import type { CheckoutPaymentMethod } from './checkout';
import type { Order, UserProfile } from './types';

export type AccountProfileRecord = UserProfile & {
  preferred_payment_method?: string | null;
};

export type AccountProfileDraft = {
  display_name: string;
  phone: string;
  email: string;
  role: string;
  default_branch: string;
  addresses: string;
  preferred_payment_method: CheckoutPaymentMethod;
};

function getHeaders(): HeadersInit {
  const token = getStoredSessionToken();
  if (!token) {
    throw new Error('You must be signed in.');
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

export async function fetchAccountOrders(): Promise<Order[]> {
  const response = await fetch(
    `${getAPIBaseURL()}/api/v1/entities/orders?sort=-id&limit=50`,
    {
      headers: getHeaders(),
    }
  );

  const data = await parseJson<{ items?: Order[] }>(response);
  return data.items || [];
}

export async function fetchAccountProfile(): Promise<AccountProfileRecord | null> {
  const response = await fetch(
    `${getAPIBaseURL()}/api/v1/entities/user_profiles?sort=-id&limit=1`,
    {
      headers: getHeaders(),
    }
  );

  const data = await parseJson<{ items?: AccountProfileRecord[] }>(response);
  return data.items?.[0] || null;
}

export async function saveAccountProfile(
  payload: AccountProfileDraft,
  profileId?: number | null
): Promise<AccountProfileRecord> {
  const isUpdate = typeof profileId === 'number' && profileId > 0;
  const response = await fetch(
    isUpdate
      ? `${getAPIBaseURL()}/api/v1/entities/user_profiles/${profileId}`
      : `${getAPIBaseURL()}/api/v1/entities/user_profiles`,
    {
      method: isUpdate ? 'PUT' : 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    }
  );

  return parseJson<AccountProfileRecord>(response);
}

export async function updateAccountOrder(
  orderId: number,
  payload: Partial<Order>
): Promise<Order> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/entities/orders/${orderId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });

  return parseJson<Order>(response);
}
