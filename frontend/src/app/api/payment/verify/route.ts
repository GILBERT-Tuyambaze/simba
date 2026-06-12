import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { checkRateLimit } from '@/lib/rate-limit';
import { getAdminSupabase, json, requireServerUser } from '../../_lib/supabase-server';

export async function POST(request: NextRequest) {
  const rateLimit = checkRateLimit(request, {
    route: 'payment:verify',
    maxRequests: 30,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return json({ detail: 'Too many payment verification attempts. Please wait and try again.' }, 429);
  }

  try {
    const { user } = await requireServerUser(request);
    const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeSecret) {
      return json({ detail: 'Stripe is not configured.' }, 503);
    }

    const { session_id: sessionId } = await request.json();
    if (!sessionId) {
      return json({ detail: 'Missing Stripe session id.' }, 400);
    }

    const stripe = new Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const orderId = Number(session.metadata?.order_id || 0);
    if (!orderId) {
      return json({ detail: 'Payment session missing order metadata.' }, 400);
    }

    const status = session.payment_status === 'paid' ? 'processing' : 'awaiting_payment';
    const admin = getAdminSupabase();
    const { data, error } = await admin
      .from('orders')
      .update({
        status,
        payment_status: session.payment_status,
      })
      .eq('id', orderId)
      .eq('user_id', user.id)
      .select()
      .single();

    if (error) throw error;

    return json({
      order_id: data.id,
      tracking_number: data.tracking_number,
      status: data.status,
      payment_status: data.payment_status || session.payment_status,
      total: Number(data.total || 0),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ detail: error instanceof Error ? error.message : 'Failed to verify payment.' }, 500);
  }
}
