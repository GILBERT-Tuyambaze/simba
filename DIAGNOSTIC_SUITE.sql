-- SIMBA DASHBOARD DATA RECOVERY - DIAGNOSTIC SUITE
-- Run these queries IN ORDER in Supabase SQL Editor
-- Purpose: Trace real data end-to-end without guessing

-- ============================================================================
-- STEP 1: DATABASE VALIDATION - Table Health Check
-- ============================================================================
-- Run this first to understand current data state

SELECT 
  'STEP_1_TABLE_COUNTS' as diagnostic_step,
  'ORDERS' as table_name,
  COUNT(*) as row_count
FROM public.orders

UNION ALL

SELECT 'STEP_1_TABLE_COUNTS', 'ORDER_ITEMS', COUNT(*)
FROM public.order_items

UNION ALL

SELECT 'STEP_1_TABLE_COUNTS', 'PRODUCTS', COUNT(*)
FROM public.products

UNION ALL

SELECT 'STEP_1_TABLE_COUNTS', 'PRODUCT_CATALOG', COUNT(*)
FROM public.product_catalog

UNION ALL

SELECT 'STEP_1_TABLE_COUNTS', 'PRODUCT_INVENTORY', COUNT(*)
FROM public.product_inventory

UNION ALL

SELECT 'STEP_1_TABLE_COUNTS', 'PROFILES', COUNT(*)
FROM public.profiles;

-- ============================================================================
-- STEP 1B: Check for orphaned/invalid data
-- ============================================================================

SELECT 
  'STEP_1B_ORPHANED_DATA' as diagnostic_step,
  'ORDER_ITEMS_NO_PRODUCT' as issue_type,
  COUNT(*) as count
FROM public.order_items oi
LEFT JOIN public.products p ON oi.product_id = p.id
WHERE p.id IS NULL AND oi.product_id IS NOT NULL

UNION ALL

SELECT 'STEP_1B_ORPHANED_DATA', 'ORDERS_NO_ITEMS', COUNT(*)
FROM public.orders o
WHERE (o.items IS NULL OR o.items = '[]')
AND NOT EXISTS (
  SELECT 1 FROM public.order_items oi WHERE oi.order_id = o.id
);

-- ============================================================================
-- STEP 2: RLS VALIDATION - Policy Check
-- ============================================================================
-- Check what policies exist for each critical table

SELECT 
  'STEP_2_RLS_POLICIES' as diagnostic_step,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles::text,
  qual
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('orders', 'order_items', 'profiles', 'products')
ORDER BY tablename, policyname;

-- ============================================================================
-- STEP 2B: RLS Access Test - Can super_admin see data?
-- ============================================================================
-- If this returns 0 for any, RLS is blocking the authenticated user

SELECT 
  'STEP_2B_RLS_ACCESS' as diagnostic_step,
  'ORDERS_VISIBLE_TO_CURRENT_USER' as access_test,
  COUNT(*) as count
FROM public.orders

UNION ALL

SELECT 'STEP_2B_RLS_ACCESS', 'ORDER_ITEMS_VISIBLE', COUNT(*)
FROM public.order_items

UNION ALL

SELECT 'STEP_2B_RLS_ACCESS', 'PROFILES_VISIBLE', COUNT(*)
FROM public.profiles

UNION ALL

SELECT 'STEP_2B_RLS_ACCESS', 'PRODUCTS_VISIBLE', COUNT(*)
FROM public.products;

-- ============================================================================
-- STEP 3: QUERY VALIDATION - Exact Query Simulation
-- ============================================================================
-- This simulates the exact query from admin.ts fetchAdminOrders()

SELECT 
  'STEP_3_QUERY_TEST' as diagnostic_step,
  COUNT(*) as orders_returned,
  MAX(created_at) as most_recent_order
FROM public.orders
LIMIT 500;

-- Check if order_items are properly joined
SELECT 
  'STEP_3_QUERY_TEST_ITEMS' as diagnostic_step,
  o.id as order_id,
  COUNT(oi.id) as item_count,
  STRING_AGG(DISTINCT oi.product_name, ', ' ORDER BY oi.product_name) as item_names
FROM public.orders o
LEFT JOIN public.order_items oi ON o.id = oi.order_id
GROUP BY o.id
LIMIT 10;

-- ============================================================================
-- STEP 4: MAPPER VALIDATION - Data Structure Check
-- ============================================================================
-- Sample order data structure to verify mapper assumptions

SELECT 
  'STEP_4_ORDER_STRUCTURE' as diagnostic_step,
  id as order_id,
  user_id,
  branch_id,
  total,
  status,
  CASE 
    WHEN items IS NULL THEN 'NULL'
    WHEN items = '[]' THEN 'EMPTY_ARRAY'
    ELSE 'HAS_DATA'
  END as items_field_type,
  created_at
FROM public.orders
ORDER BY created_at DESC
LIMIT 5;

-- Sample order_items data structure
SELECT 
  'STEP_4_ORDER_ITEMS_STRUCTURE' as diagnostic_step,
  id,
  order_id,
  product_id,
  product_name,
  price,
  quantity
FROM public.order_items
LIMIT 10;

-- Product catalog vs products table comparison
SELECT 
  'STEP_4_PRODUCT_COMPARISON' as diagnostic_step,
  pc.id,
  pc.name as catalog_name,
  p.name as products_table_name,
  pc.in_stock,
  pc.stock_count
FROM public.product_catalog pc
LEFT JOIN public.products p ON pc.id = p.id
LIMIT 10;

-- ============================================================================
-- STEP 5: FRONTEND STATE AUDIT - Derived Metrics
-- ============================================================================
-- Calculate what dashboard should show

SELECT 
  'STEP_5_DASHBOARD_METRICS' as diagnostic_step,
  'TOTAL_ORDERS' as metric_name,
  COUNT(*)::text as metric_value
FROM public.orders

UNION ALL

SELECT 'STEP_5_DASHBOARD_METRICS', 'TOTAL_REVENUE', 
  COALESCE(SUM(total)::text, '0')
FROM public.orders

UNION ALL

SELECT 'STEP_5_DASHBOARD_METRICS', 'TOTAL_ITEMS_SOLD',
  COUNT(*)::text
FROM public.order_items

UNION ALL

SELECT 'STEP_5_DASHBOARD_METRICS', 'UNIQUE_PRODUCTS',
  COUNT(DISTINCT product_id)::text
FROM public.order_items

UNION ALL

SELECT 'STEP_5_DASHBOARD_METRICS', 'ORDERS_BY_STATUS_PENDING',
  COUNT(*)::text
FROM public.orders
WHERE status = 'pending';

-- ============================================================================
-- SUMMARY: Data Recovery Status Report
-- ============================================================================

WITH diagnostics AS (
  SELECT 'Database State' as check_category, 'Tables populated' as check_name,
    CASE 
      WHEN (SELECT COUNT(*) FROM public.orders) > 0 
        AND (SELECT COUNT(*) FROM public.order_items) > 0 
      THEN '✅ DATA EXISTS'
      ELSE '❌ MISSING DATA'
    END as status
  
  UNION ALL
  
  SELECT 'RLS Policy', 'Profiles read policy',
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' 
        AND policyname LIKE '%read%'
      )
      THEN '✅ EXISTS'
      ELSE '❌ MISSING'
    END
  
  UNION ALL
  
  SELECT 'Data Integrity', 'Orphaned order_items',
    CASE 
      WHEN (
        SELECT COUNT(*) FROM public.order_items oi
        LEFT JOIN public.products p ON oi.product_id = p.id
        WHERE p.id IS NULL AND oi.product_id IS NOT NULL
      ) = 0
      THEN '✅ CLEAN'
      ELSE '❌ FOUND'
    END
  
  UNION ALL
  
  SELECT 'Query Access', 'User can see orders',
    CASE 
      WHEN (SELECT COUNT(*) FROM public.orders) > 0 
      THEN '✅ ACCESSIBLE'
      ELSE '❌ BLOCKED'
    END
)
SELECT check_category, check_name, status
FROM diagnostics;
