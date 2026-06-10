import { createHash } from 'crypto';
import { NextRequest } from 'next/server';
import { getAdminSupabase, json } from '../../_lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    route: '/api/analytics/visit',
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return json({ detail: 'Rate limit exceeded.' }, 429);
  }

  try {
    const body = await request.json();
    const rawClientKey = String(body.client_key || '').trim();
    if (!rawClientKey) {
      return json({ detail: 'client_key is required.' }, 400);
    }

    const clientKey = createHash('sha256').update(rawClientKey).digest('hex');
    const visitDay = new Date().toISOString().slice(0, 10);
    const userAgent = (request.headers.get('user-agent') || '').slice(0, 512);

    const admin = getAdminSupabase();
    const { error } = await admin
      .from('site_visits')
      .upsert(
        {
          client_key: clientKey,
          visit_day: visitDay,
          last_seen_at: new Date().toISOString(),
          path: String(body.path || '/').slice(0, 2048),
          referrer: body.referrer ? String(body.referrer).slice(0, 2048) : null,
          user_agent: userAgent,
        },
        { onConflict: 'client_key,visit_day' }
      );

    if (error) throw error;

    return json({ status: 'accepted' }, 202);
  } catch (error) {
    return json({ detail: error instanceof Error ? error.message : 'Failed to record visit.' }, 500);
  }
}
