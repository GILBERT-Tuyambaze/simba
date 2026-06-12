-- SIMBA DASHBOARD DATA AUDIT QUERIES
-- Run these in Supabase SQL Editor to diagnose dashboard data issues
-- Purpose: Verify data integrity before fix implementation

-- ============================================================================
-- 1. ORDERS TABLE HEALTH
-- ============================================================================
SELECT 'ORDERS TABLE COUNT' as audit_section, count(*) as result FROM public.orders;
SELECT 'ORDERS WITH NO ITEMS' as audit_section, count(*) as result 
FROM public.orders WHERE items IS NULL OR items = '[]' OR items = '';

-- Check order structure
SELECT 
  'SAMPLE ORDERS' as audit_section,
  id, 
  user_id, 
  branch, 
  total, 
  status,
  items,
  created_at
FROM public.orders 
ORDER BY created_at DESC 
LIMIT 5;

-- ============================================================================
-- 2. ORDER_ITEMS TABLE HEALTH
-- ============================================================================
SELECT 'ORDER_ITEMS COUNT' as audit_section, count(*) as result FROM public.order_items;
SELECT 'ORDER_ITEMS WITH NO PRODUCT_ID' as audit_section, count(*) as result 
FROM public.order_items WHERE product_id IS NULL OR product_id = 0;

-- Check order_items structure
SELECT 
  'SAMPLE ORDER_ITEMS' as audit_section,
  id,
  order_id,
  product_id,
  product_name,
  price,
  quantity
FROM public.order_items 
LIMIT 10;

-- Orders that have order_items vs those that don't
SELECT 
  'ORDERS vs ORDER_ITEMS SYNC' as audit_section,
  o.id as order_id,
  o.total,
  COALESCE(oi_count.count, 0) as item_count,
  CASE WHEN oi_count.count > 0 THEN 'HAS_ITEMS' ELSE 'NO_ITEMS' END as status
FROM public.orders o
LEFT JOIN (
  SELECT order_id, count(*) as count 
  FROM public.order_items 
  GROUP BY order_id
) oi_count ON o.id = oi_count.order_id
ORDER BY o.created_at DESC
LIMIT 10;

-- ============================================================================
-- 3. ORDER_ITEMS → PRODUCTS JOIN
-- ============================================================================
-- Check if order_items can join to products
SELECT 
  'ORDER_ITEMS WITH MISSING PRODUCTS' as audit_section,
  COUNT(DISTINCT oi.id) as orphaned_items
FROM public.order_items oi
LEFT JOIN public.products p ON oi.product_id = p.id
WHERE p.id IS NULL AND oi.product_id IS NOT NULL;

-- Sample order items with product details
SELECT 
  'ORDER_ITEMS + PRODUCTS JOIN' as audit_section,
  oi.id,
  oi.order_id,
  oi.product_id,
  oi.product_name,
  p.name as product_table_name,
  p.price as product_table_price,
  oi.price as order_item_price,
  CASE WHEN p.id IS NULL THEN 'MISSING_PRODUCT' ELSE 'OK' END as product_status
FROM public.order_items oi
LEFT JOIN public.products p ON oi.product_id = p.id
LIMIT 10;

-- ============================================================================
-- 4. PRODUCT_CATALOG VIEW HEALTH
-- ============================================================================
SELECT 'PRODUCT_CATALOG VIEW COUNT' as audit_section, count(*) as result FROM public.product_catalog;
SELECT 'PRODUCT_CATALOG WITH ZERO STOCK' as audit_section, count(*) as result 
FROM public.product_catalog WHERE stock_count = 0 AND in_stock = false;

-- Check product_catalog view structure
SELECT 
  'SAMPLE PRODUCT_CATALOG' as audit_section,
  id,
  name,
  price,
  category,
  stock_count,
  in_stock,
  branch_stock
FROM public.product_catalog 
LIMIT 5;

-- ============================================================================
-- 5. PRODUCTS vs PRODUCT_INVENTORY RELATIONSHIP
-- ============================================================================
SELECT 
  'PRODUCTS WITHOUT INVENTORY' as audit_section,
  COUNT(*) as count
FROM public.products p
LEFT JOIN public.product_inventory pi ON p.id = pi.product_id
WHERE pi.product_id IS NULL;

SELECT 
  'PRODUCT_INVENTORY ENTRIES' as audit_section,
  COUNT(*) as count
FROM public.product_inventory;

-- Sample inventory by branch
SELECT 
  'INVENTORY BY BRANCH' as audit_section,
  b.name as branch,
  COUNT(pi.product_id) as product_count,
  SUM(pi.stock_count) as total_stock
FROM public.branches b
LEFT JOIN public.product_inventory pi ON b.id = pi.branch_id
GROUP BY b.id, b.name;

-- ============================================================================
-- 6. PROFILES & BRANCHES RELATIONSHIPS
-- ============================================================================
SELECT 'PROFILES COUNT' as audit_section, count(*) as result FROM public.profiles;
SELECT 'BRANCHES COUNT' as audit_section, count(*) as result FROM public.branches;

-- Profiles with missing branch assignments
SELECT 
  'PROFILES WITH NO BRANCH' as audit_section,
  COUNT(*) as count
FROM public.profiles WHERE default_branch_id IS NULL OR default_branch_id = 0;

-- ============================================================================
-- 7. CRITICAL DATA FLOW VERIFICATION
-- ============================================================================
-- Complete order flow: orders → order_items → products → product_inventory
SELECT 
  'COMPLETE ORDER FLOW' as audit_section,
  o.id as order_id,
  o.status,
  o.total,
  COUNT(oi.id) as item_count,
  COUNT(DISTINCT p.id) as unique_products,
  COUNT(DISTINCT pi.product_id) as products_in_inventory
FROM public.orders o
LEFT JOIN public.order_items oi ON o.id = oi.order_id
LEFT JOIN public.products p ON oi.product_id = p.id
LEFT JOIN public.product_inventory pi ON p.id = pi.product_id
GROUP BY o.id, o.status, o.total
ORDER BY o.created_at DESC
LIMIT 10;

-- ============================================================================
-- 8. DASHBOARD METRICS VERIFICATION
-- ============================================================================
-- Metric: Total Revenue
SELECT 'METRIC_TOTAL_REVENUE' as metric, SUM(total)::numeric as value FROM public.orders;

-- Metric: Order Count
SELECT 'METRIC_ORDER_COUNT' as metric, COUNT(*)::numeric as value FROM public.orders;

-- Metric: Average Order Value
SELECT 'METRIC_AVG_ORDER_VALUE' as metric, AVG(total)::numeric as value FROM public.orders;

-- Metric: Orders by Status
SELECT 
  'METRIC_ORDERS_BY_STATUS' as metric,
  status,
  COUNT(*) as value
FROM public.orders
GROUP BY status;

-- Metric: Products in Stock
SELECT 'METRIC_IN_STOCK_COUNT' as metric, COUNT(*)::numeric as value 
FROM public.product_catalog WHERE in_stock = true;

-- ============================================================================
-- 9. RLS POLICY VERIFICATION (Run as a staff user)
-- ============================================================================
-- This will show what the currently logged-in user can see
-- Run this as different user roles to verify RLS
SELECT 
  'VISIBLE_ORDERS_FOR_CURRENT_USER' as audit_section,
  COUNT(*) as visible_orders
FROM public.orders;

SELECT 
  'VISIBLE_ORDER_ITEMS' as audit_section,
  COUNT(*) as visible_items
FROM public.order_items;

-- ============================================================================
-- 10. FOREIGN KEY INTEGRITY
-- ============================================================================
-- Check for orphaned records
SELECT 
  'ORPHANED_ORDER_ITEMS' as audit_section,
  COUNT(*) as orphaned_count
FROM public.order_items oi
WHERE NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = oi.order_id);

SELECT 
  'ORPHANED_CART_ITEMS' as audit_section,
  COUNT(*) as orphaned_count
FROM public.cart_items ci
WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = ci.product_id);
