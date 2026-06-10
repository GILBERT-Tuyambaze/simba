import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import {
  getAdminSupabase,
  json,
  requireServerUser,
} from '../../_lib/supabase-server';

const PROMO_CODE = 'SIMBA2K';
const PROMO_DISCOUNT = 2000;
const PROMO_MIN_SUBTOTAL = 15000;
const FREE_SHIPPING_THRESHOLD = 30000;
const BASE_SHIPPING = 2500;

type CheckoutItem = {
  product_id: number;
  product_name: string;
  price: number;
  quantity: number;
  image?: string | null;
  unit?: string | null;
};

function createTrackingNumber(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(2, 14);
  return `SIM-${timestamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function calculateDiscount(subtotal: number, promoCode?: string | null): number {
  if (!promoCode) return 0;
  if (promoCode.trim().toUpperCase() !== PROMO_CODE) {
    throw new Error(`Invalid promo code. Use ${PROMO_CODE} for the checkout discount.`);
  }
  if (subtotal < PROMO_MIN_SUBTOTAL) {
    throw new Error(`Promo code ${PROMO_CODE} requires a minimum spend of RWF ${PROMO_MIN_SUBTOTAL.toLocaleString()}.`);
  }
  return Math.min(PROMO_DISCOUNT, subtotal);
}

function calculateShipping(subtotal: number, deliveryMethod: string): number {
  if (deliveryMethod === 'pickup') return 0;
  return subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : BASE_SHIPPING;
}

export async function POST(request: NextRequest) {
  try {
    const { user } = await requireServerUser(request);
    const admin = getAdminSupabase();
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items as CheckoutItem[] : [];

    if (!items.length) {
      return json({ detail: 'Cart is empty.' }, 400);
    }

    const { data: branch, error: branchError } = await admin
      .from('branches')
      .select('id, name')
      .eq('name', body.branch)
      .maybeSingle();
    if (branchError) throw branchError;
    if (!branch) return json({ detail: 'Selected branch was not found.' }, 404);

    const subtotal = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0);
    const discount = calculateDiscount(subtotal, body.promo_code);
    const shipping = calculateShipping(subtotal, body.delivery_method || 'delivery');
    const depositAmount = body.delivery_method === 'pickup'
      ? body.allow_partial_fulfillment ? 2000 : 500
      : 0;
    const total = Math.max(subtotal - discount + shipping + depositAmount, 0);
    const trackingNumber = createTrackingNumber();
    const paymentMethod = body.payment_method || 'mtn_momo';
    const status = paymentMethod === 'card'
      ? 'awaiting_payment'
      : paymentMethod === 'mtn_momo' || paymentMethod === 'airtel_money'
        ? 'awaiting_confirmation'
        : 'pending';

    for (const item of items) {
      const { data: inventory, error: inventoryError } = await admin
        .from('product_inventory')
        .select('stock_count')
        .eq('product_id', item.product_id)
        .eq('branch_id', branch.id)
        .maybeSingle();
      if (inventoryError) throw inventoryError;
      const available = Number(inventory?.stock_count || 0);
      if (!body.allow_partial_fulfillment && Number(item.quantity || 0) > available) {
        return json({ detail: `${item.product_name} only has ${available} left for ${branch.name}.` }, 400);
      }
    }

    const { data: order, error: orderError } = await admin
      .from('orders')
      .insert({
        user_id: user.id,
        customer_name: body.customer_name,
        branch_id: branch.id,
        assigned_branch_id: branch.id,
        subtotal,
        shipping,
        discount,
        deposit_amount: depositAmount,
        total,
        delivery_method: body.delivery_method || 'delivery',
        delivery_option: body.delivery_option || (body.delivery_method === 'pickup' ? 'self_pickup' : 'delivery_by_branch'),
        address: body.delivery_method === 'pickup' ? body.address || `Pickup from ${branch.name}` : body.address,
        phone: body.phone,
        payment_method: paymentMethod,
        status,
        tracking_number: trackingNumber,
        pickup_time: body.pickup_time || null,
        assigned_delivery_agent_id: body.delivery_agent_id || null,
        review_branch_id: branch.id,
        items: JSON.stringify(items),
        timeline: [{ status, label: status.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), at: new Date().toISOString() }],
      })
      .select()
      .single();
    if (orderError) throw orderError;

    const orderItems = items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      product_name: item.product_name,
      price: item.price,
      quantity: item.quantity,
      image: item.image || null,
      unit: item.unit || null,
    }));
    const { error: itemsError } = await admin.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;

    for (const item of items) {
      const { data: current } = await admin
        .from('product_inventory')
        .select('stock_count')
        .eq('product_id', item.product_id)
        .eq('branch_id', branch.id)
        .maybeSingle();
      await admin
        .from('product_inventory')
        .upsert({
          product_id: item.product_id,
          branch_id: branch.id,
          stock_count: Math.max(Number(current?.stock_count || 0) - Number(item.quantity || 0), 0),
        }, { onConflict: 'product_id,branch_id' });
    }

    if (paymentMethod !== 'card') {
      return json({
        order_id: order.id,
        tracking_number: trackingNumber,
        status,
        payment_method: paymentMethod,
        subtotal,
        shipping,
        discount,
        total,
        deposit_amount: depositAmount,
        pickup_time: body.pickup_time || null,
        message: 'Order created successfully.',
      });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
    if (!stripeSecret) {
      await admin.from('orders').delete().eq('id', order.id);
      return json({ detail: 'Stripe is not configured. Use MTN MoMo, Airtel Money or cash on delivery.' }, 503);
    }

    const stripe = new Stripe(stripeSecret);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: body.currency || 'rwf',
            product_data: { name: `Simba order #${order.id}` },
            unit_amount: Math.round(total),
          },
          quantity: 1,
        },
      ],
      success_url: body.success_url || `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: body.cancel_url || `${origin}/payment-cancel?order_id=${order.id}&tracking_number=${trackingNumber}`,
      metadata: {
        order_id: String(order.id),
        user_id: user.id,
        tracking_number: trackingNumber,
      },
      client_reference_id: String(order.id),
    });

    await admin
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.id);

    return json({
      order_id: order.id,
      tracking_number: trackingNumber,
      status,
      payment_method: paymentMethod,
      subtotal,
      shipping,
      discount,
      total,
      deposit_amount: depositAmount,
      pickup_time: body.pickup_time || null,
      session_id: session.id,
      url: session.url,
      message: 'Redirecting to Stripe checkout.',
    });
  } catch (error) {
    console.error('[API create-session] error creating checkout session:', error);
    if (error instanceof Response) return error;
    return json({ detail: error instanceof Error ? error.message : 'Failed to create checkout session.' }, 500);
  }
}
