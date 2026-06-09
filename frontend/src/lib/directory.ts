import { resolveBranchId } from './branches';
import { mapSupabaseProfile } from './supabase-mappers';
import { supabase } from './supabase';
import type { UserProfile } from './types';

export async function fetchBranchDirectory(
  branch: string,
  role?: string
): Promise<UserProfile[]> {
  const branchId = await resolveBranchId(branch);
  if (!branchId) {
    return [];
  }

  let query = supabase
    .from('profiles')
    .select('*, branches:default_branch_id(name)')
    .eq('default_branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(200);

  if (role) {
    query = query.eq('role', role);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return (data || []).map(mapSupabaseProfile);
}
