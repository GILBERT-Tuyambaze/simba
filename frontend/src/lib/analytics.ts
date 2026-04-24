import { getStoredSessionToken } from './auth';
import { getAPIBaseURL } from './config';

export type VisitSummary = {
  total_visits: number;
  visits_today: number;
  visits_last_7_days: number;
  visits_last_30_days: number;
  visits_last_90_days: number;
};

const VISITOR_KEY_STORAGE = 'simba_visitor_key';
const VISITOR_LAST_SENT_DAY_STORAGE = 'simba_visitor_last_sent_day';

function buildHeaders(): HeadersInit {
  const headers: HeadersInit = {};
  const token = getStoredSessionToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function getOrCreateVisitorKey(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY_STORAGE)?.trim();
    if (existing) {
      return existing;
    }

    const created =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(VISITOR_KEY_STORAGE, created);
    return created;
  } catch {
    return `visitor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function trackSiteVisit(path: string): Promise<void> {
  const todayKey = getTodayKey();

  try {
    if (localStorage.getItem(VISITOR_LAST_SENT_DAY_STORAGE) === todayKey) {
      return;
    }
  } catch {
    // Ignore storage failures.
  }

  const response = await fetch(`${getAPIBaseURL()}/api/v1/analytics/visit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      client_key: getOrCreateVisitorKey(),
      path,
      referrer: typeof document !== 'undefined' ? document.referrer || null : null,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to track site visit (${response.status})`);
  }

  try {
    localStorage.setItem(VISITOR_LAST_SENT_DAY_STORAGE, todayKey);
  } catch {
    // Ignore storage failures.
  }
}

export async function fetchVisitSummary(): Promise<VisitSummary> {
  const response = await fetch(`${getAPIBaseURL()}/api/v1/analytics/summary`, {
    headers: buildHeaders(),
  });

  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      }
    } catch {
      detail = null;
    }
    throw new Error(detail || `Failed to load analytics summary (${response.status})`);
  }

  return response.json() as Promise<VisitSummary>;
}
