import { getStoredSessionToken } from './auth';
import { getAPIBaseURL } from './config';
import type { Invitation, Order, Product, UserProfile } from './types';

type ListResponse<T> = {
  items?: T[];
};

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  const token = getStoredSessionToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function parseListResponse<T>(response: Response): Promise<T[]> {
  if (!response.ok) {
    let detail = null as string | null;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      detail = null;
    }

    throw new Error(detail || `Request failed (${response.status})`);
  }

  const data = (await response.json()) as ListResponse<T>;
  return data.items || [];
}

async function parseItemResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail = null as string | null;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      detail = null;
    }

    throw new Error(detail || `Request failed (${response.status})`);
  }

  return response.json() as Promise<T>;
}

export async function fetchAdminOrders(limit = 500): Promise<Order[]> {
  const response = await fetch(
    `${getAPIBaseURL()}/api/v1/entities/orders/all?sort=-id&limit=${limit}`,
    {
      headers: buildHeaders(),
    }
  );

  return parseListResponse<Order>(response);
}

export async function fetchAdminProfiles(limit = 500): Promise<UserProfile[]> {
  const response = await fetch(
    `${getAPIBaseURL()}/api/v1/entities/user_profiles/all?sort=-id&limit=${limit}`,
    {
      headers: buildHeaders(),
    }
  );

  return parseListResponse<UserProfile>(response);
}

export async function updateAdminOrder(
  orderId: number,
  payload: Partial<Order>
): Promise<Order> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/entities/orders/${orderId}`, {
    method: 'PUT',
    headers: {
      ...buildHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update order (${response.status})`);
  }

  return response.json();
}

export async function updateAdminProduct(
  productId: number,
  payload: Partial<Product>
): Promise<Product> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/entities/products/${productId}`, {
    method: 'PUT',
    headers: {
      ...buildHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Failed to update product (${response.status})`);
  }

  return response.json();
}

export async function createAdminProduct(payload: Partial<Product>): Promise<Product> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/entities/products`, {
    method: 'POST',
    headers: {
      ...buildHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseItemResponse<Product>(response);
}

export async function fetchAdminInvitations(): Promise<Invitation[]> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/invitations`, {
    headers: buildHeaders(),
  });

  return parseListResponse<Invitation>(response);
}

export async function createRoleInvitation(payload: {
  role: string;
  branch?: string | null;
  invited_email?: string | null;
  note?: string | null;
  expires_in_days?: number;
}): Promise<Invitation> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/invitations`, {
    method: 'POST',
    headers: {
      ...buildHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseItemResponse<Invitation>(response);
}

export async function updateAdminUserRole(
  userId: string,
  payload: { role: string; branch?: string | null }
): Promise<{ id: string; role: string; email: string; name?: string | null }> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/invitations/users/${userId}/role`, {
    method: 'PUT',
    headers: {
      ...buildHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return parseItemResponse<{ id: string; role: string; email: string; name?: string | null }>(response);
}
