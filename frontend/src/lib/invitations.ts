import { getStoredSessionToken } from './auth';
import { getAPIBaseURL } from './config';
import type { Invitation } from './types';

function getHeaders(includeJson = false): HeadersInit {
  const headers: HeadersInit = {};
  const token = getStoredSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (includeJson) {
    headers['Content-Type'] = 'application/json';
  }
  return headers;
}

async function parseItemResponse<T>(response: Response): Promise<T> {
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
  return response.json() as Promise<T>;
}

export async function fetchInvitationPreview(token: string): Promise<Invitation> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/invitations/${token}`);
  return parseItemResponse<Invitation>(response);
}

export async function acceptInvitation(token: string): Promise<{
  id: string;
  email: string;
  role: string;
  name?: string | null;
}> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/invitations/${token}/accept`, {
    method: 'POST',
    headers: getHeaders(),
  });
  return parseItemResponse(response);
}
