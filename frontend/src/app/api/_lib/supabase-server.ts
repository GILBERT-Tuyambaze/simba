import { createClient } from '@supabase/supabase-js';
import { NextRequest } from 'next/server';

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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

export function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || null;
}

export function getUserSupabase(request: NextRequest) {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase anon client is not configured.');
  }
  const token = getBearerToken(request);
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
    auth: {
      persistSession: false,
    },
  });
}

export function getAdminSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service role is not configured.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  });
}

export async function requireServerUser(request: NextRequest) {
  const client = getUserSupabase(request);
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) {
    throw new Response(JSON.stringify({ detail: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return { client, user: data.user };
}

export async function getServerProfile(client: ReturnType<typeof getUserSupabase>, userId: string) {
  const { data, error } = await client
    .from('profiles')
    .select('*, branches:default_branch_id(name)')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data;
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
