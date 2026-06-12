import { randomBytes } from 'crypto';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  getAdminSupabase,
  getUserSupabase,
  json,
} from '../../_lib/supabase-server';

const PROMO_CODE = 'SIMBA2K';
const CHECKOUT_STEPS = ['auth', 'cart', 'inventory', 'rpc', 'stripe'] as const;

type CheckoutStep = typeof CHECKOUT_STEPS[number];
type CheckoutErrorCode =
  | 'RATE_LIMITED'
  | 'NOT_AUTHENTICATED'
  | 'PROFILE_MISSING'
  | 'USER_SUSPENDED'
  | 'EMPTY_CART'
  | 'INVALID_CART'
  | 'INVALID_BRANCH'
  | 'PRODUCT_NOT_FOUND'
  | 'INVENTORY_MISSING'
  | 'OUT_OF_STOCK'
  | 'INVALID_PROMO'
  | 'STRIPE_MISSING'
  | 'RPC_FAILED'
  | 'ORDER_NOT_CREATED'
  | 'STRIPE_FAILED'
  | 'ORDER_UPDATE_FAILED'
  | 'CHECKOUT_FAILED';

type CheckoutItem = {
  product_id: number;
  product_name: string;
  price: number;
  quantity: number;
  image?: string | null;
  unit?: string | null;
};

type CheckoutFailureInit = {
  step: CheckoutStep;
  code: CheckoutErrorCode;
  message: string;
  status?: number;
  details?: unknown;
};

class CheckoutFailure extends Error {
  step: CheckoutStep;
  code: CheckoutErrorCode;
  status: number;
  details?: unknown;

  constructor(init: CheckoutFailureInit) {
    super(init.message);
    this.name = 'CheckoutFailure';
    this.step = init.step;
    this.code = init.code;
    this.status = init.status || 500;
    this.details = init.details;
  }
}

function createTrackingNumber(): string {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(2, 14);
  return `SIM-${timestamp}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof CheckoutFailure) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      step: error.step,
      details: error.details,
      stack: error.stack,
    };
  }

  if (error instanceof Error) {
    const record = error as Error & {
      code?: string;
      details?: unknown;
      hint?: unknown;
      status?: unknown;
    };
    return {
      name: error.name,
      message: error.message,
      code: record.code,
      details: record.details,
      hint: record.hint,
      status: record.status,
      stack: error.stack,
    };
  }

  if (error && typeof error === 'object') {
    return error as Record<string, unknown>;
  }

  return { message: String(error) };
}

function checkoutErrorResponse(error: unknown, requestId: string) {
  const serialized = serializeError(error);
  const failure = error instanceof CheckoutFailure
    ? error
    : new CheckoutFailure({
        step: 'rpc',
        code: 'CHECKOUT_FAILED',
        message: typeof serialized.message === 'string' ? serialized.message : 'Checkout failed',
        details: serialized,
      });

  console.error('🔥 CHECKOUT ERROR:', {
    requestId,
    step: failure.step,
    code: failure.code,
    message: failure.message,
    details: failure.details,
    raw: serialized,
  });

  return json({
    success: false,
    error: failure.message,
    code: failure.code,
    step: failure.step,
    requestId,
    name: serialized.name || failure.name,
    details: serialized.details || failure.details || null,
    stack: serialized.stack || null,
  }, failure.status);
}

function logStep(requestId: string, step: string, details: Record<string, unknown> = {}) {
  console.log(`[checkout:${requestId}] ${step}`, details);
}

function normalizeItems(items: CheckoutItem[]): Array<CheckoutItem & { product_id: number; quantity: number }> {
  return items.map((item) => ({
    ...item,
    product_id: Number(item.product_id),
    quantity: Number(item.quantity),
  }));
}

function toPickupTimestamp(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export async function POST(request: NextRequest) {
  const requestId = randomBytes(4).toString('hex');
  const rateLimit = checkRateLimit(request, {
    route: 'payment:create-session',
    maxRequests: 12,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return checkoutErrorResponse(new CheckoutFailure({
      step: 'auth',
      code: 'RATE_LIMITED',
      message: 'Too many checkout attempts. Please wait and try again.',
      status: 429,
    }), requestId);
  }

  try {
    logStep(requestId, 'STEP 1: auth validating');
    const userClient = getUserSupabase(request);
    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      throw new CheckoutFailure({
        step: 'auth',
        code: 'NOT_AUTHENTICATED',
        message: 'You must be signed in to checkout.',
        status: 401,
        details: authError ? serializeError(authError) : null,
      });
    }
    const user = authData.user;
    const admin = getAdminSupabase();
    const body = await request.json();
    const items = Array.isArray(body.items) ? body.items as CheckoutItem[] : [];
    const normalizedItems = normalizeItems(items);

    if (!items.length) {
      throw new CheckoutFailure({
        step: 'cart',
        code: 'EMPTY_CART',
        message: 'Cart is empty.',
        status: 400,
      });
    }

    const invalidItem = normalizedItems.find((item) => !Number.isInteger(item.product_id) || item.product_id <= 0 || !Number.isFinite(item.quantity) || item.quantity <= 0);
    if (invalidItem) {
      throw new CheckoutFailure({
        step: 'cart',
        code: 'INVALID_CART',
        message: 'Cart contains an invalid product or quantity.',
        status: 400,
        details: { product_id: invalidItem.product_id, quantity: invalidItem.quantity },
      });
    }

    const trackingNumber = createTrackingNumber();
    const paymentMethod = body.payment_method || 'mtn_momo';
    const status = paymentMethod === 'card'
      ? 'awaiting_payment'
      : paymentMethod === 'mtn_momo' || paymentMethod === 'airtel_money'
        ? 'awaiting_confirmation'
        : 'pending';

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('user_id, role, status, default_branch_id, branch_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileError) {
      throw new CheckoutFailure({
        step: 'auth',
        code: 'PROFILE_MISSING',
        message: 'Could not load checkout profile.',
        status: 500,
        details: serializeError(profileError),
      });
    }
    if (!profile) {
      throw new CheckoutFailure({
        step: 'auth',
        code: 'PROFILE_MISSING',
        message: 'Your profile is missing. Sign out and sign in again to repair your session.',
        status: 409,
      });
    }
    if (String(profile.status || 'active') === 'suspended') {
      throw new CheckoutFailure({
        step: 'auth',
        code: 'USER_SUSPENDED',
        message: 'This account is suspended and cannot place orders.',
        status: 403,
      });
    }
    logStep(requestId, 'STEP 1: auth validated', {
      userId: user.id,
      profileRole: profile.role,
      profileStatus: profile.status || 'active',
    });

    logStep(requestId, 'STEP 2: cart validated', {
      branch: body.branch,
      itemCount: normalizedItems.length,
      paymentMethod,
    });

    if (body.promo_code && body.promo_code.trim().toUpperCase() !== PROMO_CODE) {
      throw new CheckoutFailure({
        step: 'cart',
        code: 'INVALID_PROMO',
        message: `Invalid promo code. Use ${PROMO_CODE} for the checkout discount.`,
        status: 400,
      });
    }

    const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
    if (paymentMethod === 'card' && !stripeSecret) {
      throw new CheckoutFailure({
        step: 'stripe',
        code: 'STRIPE_MISSING',
        message: 'Stripe is not configured. Use MTN MoMo, Airtel Money or cash on delivery.',
        status: 503,
      });
    }

    logStep(requestId, 'STEP 3: inventory validating', {
      productIds: normalizedItems.map((item) => item.product_id),
      branch: body.branch,
    });
    const { data: branch, error: branchError } = await admin
      .from('branches')
      .select('id, name')
      .eq('name', body.branch)
      .maybeSingle();
    if (branchError) {
      throw new CheckoutFailure({
        step: 'inventory',
        code: 'INVALID_BRANCH',
        message: 'Could not validate selected branch.',
        status: 500,
        details: serializeError(branchError),
      });
    }
    if (!branch) {
      throw new CheckoutFailure({
        step: 'inventory',
        code: 'INVALID_BRANCH',
        message: 'Selected branch was not found.',
        status: 404,
        details: { branch: body.branch },
      });
    }

    const productIds = Array.from(new Set(normalizedItems.map((item) => item.product_id)));
    const { data: products, error: productsError } = await admin
      .from('products')
      .select('id, name, discontinued')
      .in('id', productIds);
    if (productsError) {
      throw new CheckoutFailure({
        step: 'inventory',
        code: 'PRODUCT_NOT_FOUND',
        message: 'Could not validate products.',
        status: 500,
        details: serializeError(productsError),
      });
    }

    const { data: inventoryRows, error: inventoryError } = await admin
      .from('product_inventory')
      .select('product_id, branch_id, stock_count')
      .eq('branch_id', branch.id)
      .in('product_id', productIds);
    if (inventoryError) {
      throw new CheckoutFailure({
        step: 'inventory',
        code: 'INVENTORY_MISSING',
        message: 'Could not validate branch inventory.',
        status: 500,
        details: serializeError(inventoryError),
      });
    }

    const productMap = new Map((products || []).map((product) => [Number(product.id), product]));
    const inventoryMap = new Map((inventoryRows || []).map((row) => [Number(row.product_id), Number(row.stock_count || 0)]));
    for (const item of normalizedItems) {
      const product = productMap.get(item.product_id);
      if (!product || product.discontinued) {
        throw new CheckoutFailure({
          step: 'inventory',
          code: 'PRODUCT_NOT_FOUND',
          message: `${item.product_name || `Product ${item.product_id}`} is no longer available.`,
          status: 404,
          details: { product_id: item.product_id },
        });
      }

      if (!inventoryMap.has(item.product_id)) {
        throw new CheckoutFailure({
          step: 'inventory',
          code: 'INVENTORY_MISSING',
          message: `${product.name} is not stocked at ${branch.name}.`,
          status: 409,
          details: { product_id: item.product_id, branch_id: branch.id },
        });
      }

      const available = inventoryMap.get(item.product_id) || 0;
      if (!body.allow_partial_fulfillment && available < item.quantity) {
        throw new CheckoutFailure({
          step: 'inventory',
          code: 'OUT_OF_STOCK',
          message: `${product.name} only has ${available} left for ${branch.name}.`,
          status: 409,
          details: { product_id: item.product_id, branch_id: branch.id, requested: item.quantity, available },
        });
      }
    }
    logStep(requestId, 'STEP 3: inventory validated', {
      branchId: branch.id,
      productCount: productIds.length,
    });

    const pickupTime = toPickupTimestamp(body.pickup_time);
    const pickupTimeLabel = typeof body.pickup_time === 'string' ? body.pickup_time : null;
    logStep(requestId, 'STEP 4: RPC executing', {
      rpc: 'place_order_with_inventory',
      pickupTime,
      pickupTimeLabel,
    });
    const { data: orderRows, error: orderError } = await admin.rpc('place_order_with_inventory', {
      p_user_id: user.id,
      p_customer_name: body.customer_name,
      p_branch_name: body.branch,
      p_items: normalizedItems.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        product_name: item.product_name,
        image: item.image || null,
        unit: item.unit || null,
      })),
      p_delivery_method: body.delivery_method || 'delivery',
      p_delivery_option: body.delivery_option || (body.delivery_method === 'pickup' ? 'self_pickup' : 'delivery_by_branch'),
      p_address: body.address || null,
      p_phone: body.phone,
      p_payment_method: paymentMethod,
      p_status: status,
      p_tracking_number: trackingNumber,
      p_pickup_time: pickupTime,
      p_pickup_time_label: pickupTimeLabel,
      p_delivery_agent_id: body.delivery_agent_id || null,
      p_promo_code: body.promo_code || null,
      p_allow_partial_fulfillment: Boolean(body.allow_partial_fulfillment),
    });
    if (orderError) {
      throw new CheckoutFailure({
        step: 'rpc',
        code: 'RPC_FAILED',
        message: orderError.message || 'Order RPC failed.',
        status: 500,
        details: serializeError(orderError),
      });
    }

    const order = Array.isArray(orderRows) ? orderRows[0] : orderRows;
    if (!order) {
      throw new CheckoutFailure({
        step: 'rpc',
        code: 'ORDER_NOT_CREATED',
        message: 'Order could not be created.',
        status: 500,
      });
    }
    logStep(requestId, 'STEP 4: order created', {
      orderId: order.order_id,
      trackingNumber: order.tracking_number,
      total: Number(order.total || 0),
      paymentMethod: order.payment_method,
    });

    if (paymentMethod !== 'card') {
      return json({
        success: true,
        order_id: order.order_id,
        tracking_number: order.tracking_number,
        status: order.status,
        payment_method: order.payment_method,
        subtotal: Number(order.subtotal || 0),
        shipping: Number(order.shipping || 0),
        discount: Number(order.discount || 0),
        total: Number(order.total || 0),
        deposit_amount: Number(order.deposit_amount || 0),
        pickup_time: order.pickup_time || null,
        sessionId: null,
        session_id: null,
        url: null,
        message: 'Order created successfully.',
      });
    }

    if (!stripeSecret) {
      throw new CheckoutFailure({
        step: 'stripe',
        code: 'STRIPE_MISSING',
        message: 'Stripe is not configured. Use MTN MoMo, Airtel Money or cash on delivery.',
        status: 503,
      });
    }
    const stripe = new Stripe(stripeSecret);
    const origin = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin;
    const stripeTotal = Math.round(Number(order.total || 0));
    if (!Number.isFinite(stripeTotal) || stripeTotal <= 0) {
      throw new CheckoutFailure({
        step: 'stripe',
        code: 'STRIPE_FAILED',
        message: 'Order total is invalid for Stripe checkout.',
        status: 500,
        details: { total: order.total },
      });
    }

    logStep(requestId, 'STEP 5: stripe session creating', {
      orderId: order.order_id,
      amount: stripeTotal,
      currency: body.currency || 'rwf',
    });
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: body.currency || 'rwf',
            product_data: { name: `Simba order #${order.order_id}` },
            unit_amount: stripeTotal,
          },
          quantity: 1,
        },
      ],
      success_url: body.success_url || `${origin}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: body.cancel_url || `${origin}/payment-cancel?order_id=${order.order_id}&tracking_number=${order.tracking_number}`,
      metadata: {
        order_id: String(order.order_id),
        user_id: user.id,
        tracking_number: order.tracking_number,
      },
      client_reference_id: String(order.order_id),
      });
    } catch (stripeError) {
      throw new CheckoutFailure({
        step: 'stripe',
        code: 'STRIPE_FAILED',
        message: stripeError instanceof Error ? stripeError.message : 'Stripe checkout session failed.',
        status: 502,
        details: serializeError(stripeError),
      });
    }
    logStep(requestId, 'STEP 5: stripe session created', {
      orderId: order.order_id,
      sessionId: session.id,
      hasUrl: Boolean(session.url),
    });

    const { error: updateError } = await admin
      .from('orders')
      .update({ stripe_session_id: session.id })
      .eq('id', order.order_id);
    if (updateError) {
      throw new CheckoutFailure({
        step: 'stripe',
        code: 'ORDER_UPDATE_FAILED',
        message: 'Stripe session was created but the order could not be updated.',
        status: 500,
        details: serializeError(updateError),
      });
    }

    if (!session.url) {
      throw new CheckoutFailure({
        step: 'stripe',
        code: 'STRIPE_FAILED',
        message: 'Stripe did not return a checkout URL.',
        status: 502,
        details: { sessionId: session.id },
      });
    }

    return json({
      success: true,
      order_id: order.order_id,
      tracking_number: order.tracking_number,
      status: order.status,
      payment_method: order.payment_method,
      subtotal: Number(order.subtotal || 0),
      shipping: Number(order.shipping || 0),
      discount: Number(order.discount || 0),
      total: Number(order.total || 0),
      deposit_amount: Number(order.deposit_amount || 0),
      pickup_time: order.pickup_time || null,
      sessionId: session.id,
      session_id: session.id,
      url: session.url,
      message: 'Redirecting to Stripe checkout.',
    });
  } catch (error) {
    return checkoutErrorResponse(error, requestId);
  }
}
