import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { getAdminSupabase, json } from '../../_lib/supabase-server';

export async function POST(request: NextRequest) {
  const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripeSecret || !webhookSecret) {
    return json({ detail: 'Stripe webhook is not configured.' }, 503);
  }

  const stripe = new Stripe(stripeSecret);
  const payload = await request.text();
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return json({ detail: 'Missing Stripe signature.' }, 400);
  }

  try {
    const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);

    const admin = getAdminSupabase();

    const { data: existing } = await admin
      .from('stripe_events')
      .select('event_id')
      .eq('event_id', event.id)
      .maybeSingle();

    if (existing) {
      return json({ received: true, duplicate: true });
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = Number(session.metadata?.order_id || 0);
      if (orderId) {
        await admin
          .from('orders')
          .update({
            status: session.payment_status === 'paid' ? 'processing' : 'awaiting_payment',
            payment_status: session.payment_status,
            stripe_session_id: session.id,
          })
          .eq('id', orderId);
      }
    }

    await admin.from('stripe_events').insert({
      event_id: event.id,
      event_type: event.type,
      processed_at: new Date().toISOString(),
    });

    return json({ received: true });
  } catch (error) {
    return json({ detail: error instanceof Error ? error.message : 'Invalid Stripe webhook.' }, 400);
  }
}
