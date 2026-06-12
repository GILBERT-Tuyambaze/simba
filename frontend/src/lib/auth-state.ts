import type { User } from '@supabase/supabase-js';
import type { AuthUser } from './auth';
import { getPermissionsForRole, type AccessPermission } from './access-control';
import {
  ensureUserProfile,
  getProfile,
  getSupabaseUser,
  isSupabaseConfigured,
  type ProfileRecord,
} from './supabase';
import { normalizeAccessRole, normalizeStoreRole, type AccessRole } from './store-roles';

export type AuthStatus = 'guest' | 'authenticated' | 'suspended';

export type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  profile: ProfileRecord | null;
  accessRole: AccessRole;
  permissions: AccessPermission[];
  isAuthenticated: boolean;
  isSuspended: boolean;
  error: Error | null;
};

export const GUEST_AUTH_STATE: AuthState = {
  status: 'guest',
  user: null,
  profile: null,
  accessRole: 'guest',
  permissions: getPermissionsForRole('guest'),
  isAuthenticated: false,
  isSuspended: false,
  error: null,
};

function getProfileStatus(profile: ProfileRecord | null): string {
  return String(profile?.status || 'active').trim().toLowerCase();
}

export function deriveAuthState(
  user: User | null,
  profile: ProfileRecord | null,
  error: Error | null = null
): AuthState {
  if (!user || error) {
    return {
      ...GUEST_AUTH_STATE,
      error,
    };
  }

  const role = normalizeStoreRole(profile?.role);
  const accessRole = normalizeAccessRole(role);
  const isSuspended = getProfileStatus(profile) === 'suspended';
  const displayName =
    profile?.display_name ||
    profile?.full_name ||
    user.user_metadata?.display_name ||
    user.user_metadata?.name ||
    null;

  return {
    status: isSuspended ? 'suspended' : 'authenticated',
    user: {
      id: user.id,
      email: user.email || profile?.email || '',
      name: displayName,
      role: accessRole,
      default_branch: profile?.default_branch || null,
      last_login: user.last_sign_in_at || null,
    },
    profile,
    accessRole,
    permissions: getPermissionsForRole(accessRole),
    isAuthenticated: true,
    isSuspended,
    error: null,
  };
}

export async function resolveAuthState(): Promise<AuthState> {
  if (!isSupabaseConfigured()) {
    return {
      ...GUEST_AUTH_STATE,
      error: new Error('Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'),
    };
  }

  const { user, error } = await getSupabaseUser();
  if (error || !user) {
    return deriveAuthState(null, null, error);
  }

  const profile = await ensureUserProfile(user).catch(async () => getProfile(user.id));
  return deriveAuthState(user, profile);
}
