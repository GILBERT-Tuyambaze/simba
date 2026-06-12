import { createClient, type Session, type User } from '@supabase/supabase-js';
import { getRelationName } from './supabase-mappers';
import { normalizeStoreRole, type StoreRoleKey } from './store-roles';

function formatError(err: unknown) {
  try {
    if (err instanceof Error) {
      return { name: err.name, message: err.message, stack: err.stack } as const;
    }
    if (err && typeof err === 'object') {
      const obj = err as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      if ('name' in obj) result.name = obj.name;
      if ('message' in obj) result.message = obj.message;
      if ('status' in obj) result.status = obj.status;
      if ('statusText' in obj) result.statusText = obj.statusText;
      if ('error_description' in obj) result.error_description = obj.error_description;
      if ('details' in obj) result.details = obj.details;
      return Object.keys(result).length ? result : JSON.parse(JSON.stringify(err));
    }
    return String(err);
  } catch (e) {
    return String(err);
  }
}

export type ProfileRecord = {
  user_id: string;
  id?: string | null;
  display_name?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: StoreRoleKey | string | null;
  default_branch_id?: number | null;
  default_branch?: string | null;
  branch_id?: number | null;
  status?: string | null;
  addresses?: unknown;
  preferred_payment_method?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

function normalizeSupabaseUrl(value?: string): string {
  const candidate = value?.trim() || '';
  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? candidate : '';
  } catch {
    return '';
  }
}

const supabaseUrl = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export const supabase = createClient(supabaseUrl || 'http://localhost:54321', supabaseAnonKey || 'anon-key', {
  auth: {
    autoRefreshToken: true,
    detectSessionInUrl: true,
    persistSession: true,
  },
});

export async function getSupabaseUser(): Promise<{ user: User | null; error: Error | null }> {
  if (!isSupabaseConfigured()) {
    const error = new Error(
      'Supabase is not configured. Please set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
    );
    console.error('[Supabase] auth.getUser aborted', {
      supabaseUrl,
      anonKeyConfigured: Boolean(supabaseAnonKey),
      error: error.message,
    });
    return { user: null, error };
  }

  const authEndpoint = `${supabaseUrl}/auth/v1/user`;
  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) {
      console.error('[Supabase] auth.getSession failed', {
        authEndpoint,
        supabaseUrl,
        anonKeyConfigured: Boolean(supabaseAnonKey),
        error: formatError(sessionError),
      });
      return { user: null, error: sessionError };
    }

    if (!sessionData.session) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('No active Supabase session (guest user)');
      }
      return { user: null, error: null };
    }

    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.error('[Supabase] auth.getUser failed', {
        authEndpoint,
        supabaseUrl,
        anonKeyConfigured: Boolean(supabaseAnonKey),
        error: formatError(error),
      });
      return { user: data?.user ?? null, error };
    }

    if (!data?.user) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('Supabase session exists but no user was returned');
      }
      return { user: null, error: null };
    }

    return { user: data.user, error: null };
  } catch (unexpected) {
    console.error('[Supabase] auth.getUser threw unexpected error', {
      authEndpoint,
      supabaseUrl,
      anonKeyConfigured: Boolean(supabaseAnonKey),
      error: formatError(unexpected),
    });
    throw unexpected;
  }
}

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) {
    console.warn('[Supabase] session fetch skipped because Supabase is not configured');
    return null;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) {
    throw error;
  }
  return data.session;
}

export async function getProfile(userId: string): Promise<ProfileRecord | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*, branches:default_branch_id(name)')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  return {
    ...data,
    default_branch: getRelationName(data.branches) || null,
  };
}

export async function ensureUserProfile(user: User): Promise<ProfileRecord> {
  const existing = await getProfile(user.id).catch(() => null);
  if (existing) {
    return existing;
  }

  const displayName =
    typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name
      : typeof user.user_metadata?.full_name === 'string'
        ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : user.email?.split('@')[0] || 'Simba customer';

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      user_id: user.id,
      email: user.email,
      display_name: displayName,
      full_name: displayName,
      avatar_url: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
      role: 'customer',
      status: 'active',
    })
    .select('*, branches:default_branch_id(name)')
    .single();

  if (error) {
    throw error;
  }

  return {
    ...data,
    role: normalizeStoreRole(data.role),
    default_branch: getRelationName(data.branches) || null,
  };
}
