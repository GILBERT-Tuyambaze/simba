import { getStoredSessionToken } from './auth';
import { getAPIBaseURL } from './config';
import type { UserProfile } from './types';

function getHeaders(): HeadersInit {
  const token = getStoredSessionToken();
  if (!token) {
    throw new Error('You must be signed in.');
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchBranchDirectory(branch: string, role?: string): Promise<UserProfile[]> {
  const url = new URL(`${getAPIBaseURL()}/api/v1/entities/user_profiles/directory`);
  url.searchParams.set('branch', branch);
  if (role) {
    url.searchParams.set('role', role);
  }

  const response = await fetch(url.toString(), {
    headers: getHeaders(),
  });

  if (!response.ok) {
    let detail = null as string | null;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      detail = null;
    }
    throw new Error(detail || `Request failed (${response.status})`);
  }

  const data = (await response.json()) as { items?: UserProfile[] };
  return data.items || [];
}
