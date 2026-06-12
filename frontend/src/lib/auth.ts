import { getSupabaseUser, supabase } from './supabase';
import { getRelationName } from './supabase-mappers';
import { normalizeStoreRole, type AccessRole } from './store-roles';

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  role: AccessRole;
  default_branch?: string | null;
  last_login?: string | null;
};

export type TokenExchangeResponse = {
  token: string;
  expires_at: string;
  user: AuthUser;
};

const TOKEN_KEY = 'simba_auth_token';

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

export async function getCurrentUser(): Promise<AuthUser | null> {
  const { user, error: authError } = await getSupabaseUser();
  if (authError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, display_name, email, branches:default_branch_id(name)')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileError) {
    throw profileError;
  }

  return {
    id: user.id,
    email: user.email || profile?.email || '',
    name: profile?.display_name || user.user_metadata?.name || null,
    role: normalizeStoreRole(profile?.role),
    default_branch: getRelationName(profile?.branches) || null,
    last_login: user.last_sign_in_at || null,
  };
}

export function getAuthErrorMessage(error: unknown, fallback = 'Authentication failed'): string {
  const message = getErrorMessage(error, fallback);
  const lowered = message.toLowerCase();

  // Preserve auth diagnostics instead of collapsing them into
  // a generic credential error.
  if (
    lowered.includes('invalid supabase token') ||
    lowered.includes('token used too early') ||
    lowered.includes('auth clock') ||
    lowered.includes('computer clock') ||
    lowered.includes('supabase auth') ||
    lowered.includes('temporarily unavailable')
  ) {
    return message;
  }

  if (
    lowered.includes('auth/') ||
    lowered.includes('supabase') ||
    lowered.includes('credential') ||
    lowered.includes('password')
  ) {
    return 'Login credentials not found or do not match.';
  }

  return message;
}
