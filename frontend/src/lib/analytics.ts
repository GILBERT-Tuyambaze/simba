import { supabase } from './supabase';

export type VisitSummary = {
  total_visits: number;
  visits_today: number;
  visits_last_7_days: number;
  visits_last_30_days: number;
  visits_last_90_days: number;
};

const VISITOR_KEY_STORAGE = 'simba_visitor_key';
const VISITOR_LAST_SENT_DAY_STORAGE = 'simba_visitor_last_sent_day';

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

  const response = await fetch('/api/analytics/visit', {
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
  const { data, error } = await supabase
    .from('site_visits')
    .select('visit_day');

  if (error) {
    throw error;
  }

  const today = getTodayKey();
  const now = new Date(`${today}T00:00:00.000Z`).getTime();
  const rows = data || [];
  const withinDays = (value: string, days: number) => {
    const day = new Date(`${value}T00:00:00.000Z`).getTime();
    return day >= now - (days - 1) * 24 * 60 * 60 * 1000;
  };

  return {
    total_visits: rows.length,
    visits_today: rows.filter((row: any) => row.visit_day === today).length,
    visits_last_7_days: rows.filter((row: any) => withinDays(row.visit_day, 7)).length,
    visits_last_30_days: rows.filter((row: any) => withinDays(row.visit_day, 30)).length,
    visits_last_90_days: rows.filter((row: any) => withinDays(row.visit_day, 90)).length,
  };
}
