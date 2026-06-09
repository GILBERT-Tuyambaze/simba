import { NextRequest } from 'next/server';
import { getAdminSupabase, json, requireServerUser } from '../../_lib/supabase-server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const client = getAdminSupabase();
    const { data, error } = await client
      .from('invitations')
      .select('token, role, invited_email, status, expires_at, branches:branch_id(name)')
      .eq('token', token)
      .maybeSingle();

    if (error) throw error;
    if (!data || data.status !== 'pending') {
      return json({ detail: 'Invitation not found or no longer valid.' }, 404);
    }
    if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) {
      return json({ detail: 'Invitation is expired.' }, 410);
    }
    const relatedBranch = Array.isArray(data.branches) ? data.branches[0] : data.branches;

    return json({
      token: data.token,
      role: data.role,
      branch: relatedBranch?.name || null,
      invited_email: data.invited_email,
      status: data.status,
      expires_at: data.expires_at,
    });
  } catch (error) {
    return json({ detail: error instanceof Error ? error.message : 'Failed to load invitation.' }, 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const { user } = await requireServerUser(request);
    const admin = getAdminSupabase();
    const { data: invitation, error } = await admin
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (error) throw error;
    if (!invitation || invitation.status !== 'pending') {
      return json({ detail: 'Invitation not found or no longer valid.' }, 404);
    }
    if (invitation.expires_at && new Date(invitation.expires_at).getTime() < Date.now()) {
      return json({ detail: 'Invitation is expired.' }, 410);
    }
    if (invitation.invited_email && invitation.invited_email !== user.email?.toLowerCase()) {
      return json({ detail: 'Invitation email does not match this account.' }, 403);
    }

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          email: user.email,
          role: invitation.role,
          default_branch_id: invitation.branch_id,
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single();
    if (profileError) throw profileError;

    const { error: invitationError } = await admin
      .from('invitations')
      .update({
        status: 'accepted',
        used_by: user.id,
        used_at: new Date().toISOString(),
      })
      .eq('id', invitation.id);
    if (invitationError) throw invitationError;

    return json({
      id: user.id,
      email: user.email || '',
      name: profile.display_name || user.user_metadata?.name || null,
      role: profile.role,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ detail: error instanceof Error ? error.message : 'Failed to accept invitation.' }, 500);
  }
}
