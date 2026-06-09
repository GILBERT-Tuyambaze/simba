import { supabase } from './supabase';

const branchIdCache = new Map<string, number | null>();

export async function resolveBranchId(branchName?: string | null): Promise<number | null> {
  const normalized = (branchName || '').trim();
  if (!normalized) {
    return null;
  }
  if (branchIdCache.has(normalized)) {
    return branchIdCache.get(normalized) ?? null;
  }

  const { data, error } = await supabase
    .from('branches')
    .select('id')
    .eq('name', normalized)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const id = data?.id ? Number(data.id) : null;
  branchIdCache.set(normalized, id);
  return id;
}

export async function getBranchNameById(branchId?: number | null): Promise<string | null> {
  if (!branchId) {
    return null;
  }

  const { data, error } = await supabase
    .from('branches')
    .select('name')
    .eq('id', branchId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.name || null;
}
