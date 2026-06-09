import { createClient, type Session, type User } from '@supabase/supabase-js';
import { getRelationName } from './supabase-mappers';
import { normalizeStoreRole, type StoreRoleKey } from './store-roles';

export type ProfileRecord = {
  user_id: string;
  display_name?: string | null;
  phone?: string | null;
  email?: string | null;
  role?: StoreRoleKey | string | null;
  default_branch_id?: number | null;
  default_branch?: string | null;
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

export async function getCurrentSupabaseSession(): Promise<Session | null> {
  if (!isSupabaseConfigured()) {
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
      : typeof user.user_metadata?.name === 'string'
        ? user.user_metadata.name
        : user.email?.split('@')[0] || 'Simba customer';

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      user_id: user.id,
      email: user.email,
      display_name: displayName,
      role: 'customer',
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
