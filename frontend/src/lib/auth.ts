import { getAPIBaseURL } from './config';

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  last_login?: string | null;
};

export type TokenExchangeResponse = {
  token: string;
  expires_at: string;
  user: AuthUser;
};

const TOKEN_KEY = 'simba_auth_token';

function getBaseURL() {
  return getAPIBaseURL();
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
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

export function getStoredSessionToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function storeSessionToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Ignore storage failures in constrained browsers/private mode.
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage failures in constrained browsers/private mode.
  }
}

export async function exchangeFirebaseToken(idToken: string): Promise<TokenExchangeResponse> {
  const response = await fetch(`${getBaseURL()}/api/v1/auth/token/exchange`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id_token: idToken }),
  });

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    if (detail?.includes('Firebase service account file was not found')) {
      throw new Error(
        'Sign-in is blocked because the backend Firebase admin key is missing. Add the Firebase service-account JSON in the backend configuration or backend folder, then try again.'
      );
    }
    throw new Error(
      detail || `Failed to exchange Firebase token (${response.status})`
    );
  }

  return response.json();
}

export async function getCurrentUser(token: string): Promise<AuthUser | null> {
  const response = await fetch(`${getBaseURL()}/api/v1/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    const detail = await readErrorDetail(response);
    throw new Error(detail || 'Failed to load current user');
  }

  return response.json();
}

export function getAuthErrorMessage(error: unknown, fallback = 'Authentication failed'): string {
  const message = getErrorMessage(error, fallback);
  const lowered = message.toLowerCase();

  if (
    lowered.includes('auth/') ||
    lowered.includes('firebase') ||
    lowered.includes('credential') ||
    lowered.includes('password')
  ) {
    return 'Login credentials not found or do not match.';
  }

  return message;
}
