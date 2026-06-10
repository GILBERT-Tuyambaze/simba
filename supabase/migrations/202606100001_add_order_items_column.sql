-- Ensure `public.orders` has a persisted JSON payload for line items.
-- This supports the web UI and avoids checkout failures when the live table includes
-- a non-null `items` column.

alter table if exists public.orders
  add column if not exists items text not null default '[]';

alter table if exists public.orders
  alter column items set default '[]';

create or replace function public.place_order_with_inventory(
  p_user_id uuid,
  p_customer_name text,
  p_branch_name text,
  p_items jsonb,
  p_delivery_method public.delivery_method,
  p_delivery_option public.delivery_option,
  p_address text,
  p_phone text,
  p_payment_method public.payment_method,
  p_status public.order_status,
  p_tracking_number text,
  p_pickup_time timestamptz default null,
  p_pickup_time_label text default null,
  p_delivery_agent_id uuid default null,
  p_promo_code text default null,
  p_allow_partial_fulfillment boolean default false
)
returns table (
  order_id bigint,
  tracking_number text,
  status public.order_status,
  payment_method public.payment_method,
  subtotal numeric,
  shipping numeric,
  discount numeric,
  total numeric,
  deposit_amount numeric,
  pickup_time timestamptz,
  pickup_time_label text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id bigint;
  v_subtotal numeric(12,2) := 0;
  v_shipping numeric(12,2) := 0;
  v_discount numeric(12,2) := 0;
  v_deposit numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_order_id bigint;
  v_now timestamptz := now();
  v_item record;
  v_product record;
  v_available integer;
  v_line_price numeric(12,2);
begin
  if p_user_id is null then
    raise exception 'User is required.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Cart is empty.';
  end if;

  select id into v_branch_id
  from public.branches
  where name = p_branch_name
  limit 1;

  if v_branch_id is null then
    raise exception 'Selected branch was not found.';
  end if;

  for v_item in
    select
      (item->>'product_id')::bigint as product_id,
      greatest((item->>'quantity')::integer, 0) as quantity
    from jsonb_array_elements(p_items) item
    order by (item->>'product_id')::bigint
  loop
    if v_item.quantity <= 0 then
      raise exception 'Invalid quantity for product %.', v_item.product_id;
    end if;

    select id, name, price, discount, image, unit, discontinued
    into v_product
    from public.products
    where id = v_item.product_id
    for share;

    if v_product.id is null or v_product.discontinued then
      raise exception 'Product % is no longer available.', v_item.product_id;
    end if;

    select stock_count
    into v_available
    from public.product_inventory
    where product_id = v_item.product_id
      and branch_id = v_branch_id
    for update;

    v_available := coalesce(v_available, 0);
    if not p_allow_partial_fulfillment and v_item.quantity > v_available then
      raise exception '% only has % left for %.', v_product.name, v_available, p_branch_name;
    end if;

    v_line_price := round(v_product.price * (1 - coalesce(v_product.discount, 0)::numeric / 100), 2);
    v_subtotal := v_subtotal + (v_line_price * v_item.quantity);
  end loop;

  if p_promo_code is not null and btrim(p_promo_code) <> '' then
    if upper(btrim(p_promo_code)) <> 'SIMBA2K' then
      raise exception 'Invalid promo code. Use SIMBA2K for the checkout discount.';
    end if;
    if v_subtotal < 15000 then
      raise exception 'Promo code SIMBA2K requires a minimum spend of RWF 15,000.';
    end if;
    v_discount := least(2000, v_subtotal);
  end if;

  if p_delivery_method = 'pickup'::public.delivery_method then
    v_shipping := 0;
    v_deposit := case when p_allow_partial_fulfillment then 2000 else 500 end;
  else
    v_shipping := case when v_subtotal >= 30000 then 0 else 2500 end;
    v_deposit := 0;
  end if;

  v_total := greatest(v_subtotal - v_discount + v_shipping + v_deposit, 0);

  insert into public.orders (
    user_id,
    customer_name,
    branch_id,
    assigned_branch_id,
    subtotal,
    shipping,
    discount,
    deposit_amount,
    total,
    delivery_method,
    delivery_option,
    address,
    phone,
    payment_method,
    status,
    tracking_number,
    pickup_time,
    assigned_delivery_agent_id,
    review_branch_id,
    items,
    timeline,
    metadata
  )
  values (
    p_user_id,
    p_customer_name,
    v_branch_id,
    v_branch_id,
    v_subtotal,
    v_shipping,
    v_discount,
    v_deposit,
    v_total,
    p_delivery_method,
    p_delivery_option,
    case when p_delivery_method = 'pickup'::public.delivery_method then coalesce(p_address, 'Pickup from ' || p_branch_name) else p_address end,
    p_phone,
    p_payment_method,
    p_status,
    p_tracking_number,
    p_pickup_time,
    p_delivery_agent_id,
    v_branch_id,
    p_items::text,
    jsonb_build_array(jsonb_build_object(
      'status', p_status,
      'label', initcap(replace(p_status::text, '_', ' ')),
      'at', v_now
    )),
    jsonb_strip_nulls(jsonb_build_object(
      'pickup_time_label', p_pickup_time_label,
      'promo_code', nullif(upper(btrim(coalesce(p_promo_code, ''))), ''),
      'allow_partial_fulfillment', p_allow_partial_fulfillment
    ))
  )
  returning id into v_order_id;

  for v_item in
    select
      (item->>'product_id')::bigint as product_id,
      greatest((item->>'quantity')::integer, 0) as quantity
    from jsonb_array_elements(p_items) item
    order by (item->>'product_id')::bigint
  loop
    select id, name, price, discount, image, unit
    into v_product
    from public.products
    where id = v_item.product_id;

    v_line_price := round(v_product.price * (1 - coalesce(v_product.discount, 0)::numeric / 100), 2);

    insert into public.order_items (
      order_id,
      product_id,
      product_name,
      price,
      quantity,
      image,
      unit
    )
    values (
      v_order_id,
      v_product.id,
      v_product.name,
      v_line_price,
      v_item.quantity,
      v_product.image,
      v_product.unit
    );

    update public.product_inventory
    set stock_count = greatest(stock_count - v_item.quantity, 0),
        updated_at = v_now
    where product_id = v_item.product_id
      and branch_id = v_branch_id;
  end loop;

  return query
  select
    v_order_id,
    p_tracking_number,
    p_status,
    p_payment_method,
    v_subtotal,
    v_shipping,
    v_discount,
    v_total,
    v_deposit,
    p_pickup_time,
    p_pickup_time_label;
end;
$$;

grant execute on function public.place_order_with_inventory(
  uuid,
  text,
  text,
  jsonb,
  public.delivery_method,
  public.delivery_option,
  text,
  text,
  public.payment_method,
  public.order_status,
  text,
  timestamptz,
  text,
  uuid,
  text,
  boolean
) to service_role;
