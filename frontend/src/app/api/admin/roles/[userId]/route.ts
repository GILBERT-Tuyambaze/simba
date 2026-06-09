import { NextRequest } from 'next/server';
import { normalizeStoreRole } from '@/lib/store-roles';
import {
  getAdminSupabase,
  getServerProfile,
  json,
  requireServerUser,
} from '../../../_lib/supabase-server';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { client, user } = await requireServerUser(request);
    const actorProfile = await getServerProfile(client, user.id);
    if (normalizeStoreRole(actorProfile?.role) !== 'super_admin') {
      return json({ detail: 'Only super admin can update roles.' }, 403);
    }

    const { userId } = await params;
    const body = await request.json();
    const role = normalizeStoreRole(body.role);
    let branchId = null as number | null;

    if (typeof body.branch === 'string' && body.branch.trim()) {
      const { data: branch, error: branchError } = await client
        .from('branches')
        .select('id')
        .eq('name', body.branch.trim())
        .maybeSingle();
      if (branchError) throw branchError;
      branchId = branch?.id || null;
    }

    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('profiles')
      .upsert(
        {
          user_id: userId,
          role,
          default_branch_id: branchId,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();

    if (error) throw error;

    return json({
      id: userId,
      email: data.email || '',
      name: data.display_name || null,
      role: data.role,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ detail: error instanceof Error ? error.message : 'Failed to update user role.' }, 500);
  }
}
