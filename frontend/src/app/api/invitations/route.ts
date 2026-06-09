import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import { canInviteRole, normalizeStoreRole } from '@/lib/store-roles';
import { getRelationName } from '@/lib/supabase-mappers';
import { json, requireServerUser, getServerProfile } from '../_lib/supabase-server';

export async function POST(request: NextRequest) {
  try {
    const { client, user } = await requireServerUser(request);
    const profile = await getServerProfile(client, user.id);
    const actorRole = normalizeStoreRole(profile?.role);
    const body = await request.json();
    const targetRole = normalizeStoreRole(body.role);

    if (!canInviteRole(actorRole, targetRole)) {
      return json({ detail: 'You cannot invite that role.' }, 403);
    }

    let branchId = null as number | null;
    const requestedBranch = typeof body.branch === 'string' ? body.branch.trim() : '';
    if (requestedBranch) {
      const { data: branch, error: branchError } = await client
        .from('branches')
        .select('id')
        .eq('name', requestedBranch)
        .maybeSingle();
      if (branchError) throw branchError;
      branchId = branch?.id || null;
    }

    if (actorRole !== 'super_admin') {
      branchId = profile?.default_branch_id || null;
    }

    if (['branch_manager', 'branch_staff', 'delivery_agent'].includes(targetRole) && !branchId) {
      return json({ detail: 'Branch is required for that role.' }, 400);
    }

    const expiresInDays = Math.max(Number(body.expires_in_days || 7), 1);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();
    const token = randomBytes(24).toString('base64url');

    const { data, error } = await client
      .from('invitations')
      .insert({
        token,
        role: targetRole,
        branch_id: branchId,
        invited_email: typeof body.invited_email === 'string' ? body.invited_email.trim().toLowerCase() || null : null,
        note: body.note || null,
        created_by: user.id,
        inviter_role: actorRole,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('*, branches:branch_id(name)')
      .single();

    if (error) throw error;

    return json({
      id: data.id,
      token: data.token,
      role: data.role,
      branch: getRelationName(data.branches),
      invited_email: data.invited_email,
      note: data.note,
      status: data.status,
      expires_at: data.expires_at,
      created_at: data.created_at,
    }, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ detail: error instanceof Error ? error.message : 'Failed to create invitation.' }, 500);
  }
}
