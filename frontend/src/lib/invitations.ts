import { supabase } from './supabase';
import type { Invitation } from './types';

async function getAuthHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = await response.json();
      detail = typeof body?.detail === 'string' ? body.detail : null;
    } catch {
      detail = null;
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function fetchInvitationPreview(token: string): Promise<Invitation> {
  const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`);
  return parseJson<Invitation>(response);
}

export async function acceptInvitation(token: string): Promise<{
  id: string;
  email: string;
  name?: string | null;
  role: string;
}> {
  const response = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: await getAuthHeaders(),
  });

  return parseJson<{
    id: string;
    email: string;
    name?: string | null;
    role: string;
  }>(response);
}
