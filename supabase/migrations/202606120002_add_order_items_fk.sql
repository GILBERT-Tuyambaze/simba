-- Migration: Add Foreign Key Constraint on order_items.product_id
-- Date: 2026-06-12
-- Purpose: Ensure referential integrity between order_items and products tables
-- Issue: Deleted products can leave orphaned order_items without constraint enforcement

-- ============================================================================
-- Check for existing constraint before adding
-- ============================================================================
-- Constraint check: 
-- SELECT constraint_name FROM information_schema.table_constraints 
-- WHERE table_name = 'order_items' AND constraint_type = 'FOREIGN KEY'

-- ============================================================================
-- Add Foreign Key Constraint: order_items.product_id → products.id
-- ============================================================================
-- ON DELETE SET NULL: If a product is deleted, set product_id to NULL
-- This allows order history to survive product deletions
-- The dashboard frontend shows "Unknown Product" for these items
alter table public.order_items
add constraint fk_order_items_product_id
foreign key (product_id) 
references public.products(id) 
on delete set null;

-- ============================================================================
-- Create Index for Performance
-- ============================================================================
-- Index helps query performance when joining order_items to products
create index if not exists idx_order_items_product_id on public.order_items(product_id);

-- ============================================================================
-- Verify constraint exists
-- ============================================================================
-- Run these queries to verify:
--
-- 1. Check constraint exists:
--    SELECT constraint_name, table_name, column_name
--    FROM information_schema.key_column_usage
--    WHERE table_name = 'order_items' AND column_name = 'product_id';
--
-- 2. Check index exists:
--    SELECT indexname FROM pg_indexes
--    WHERE tablename = 'order_items' AND indexname = 'idx_order_items_product_id';
--
-- 3. Verify FK definition:
--    SELECT constraint_name, table_name, referenced_table_name
--    FROM information_schema.referential_constraints
--    WHERE table_name = 'order_items';

-- ============================================================================
-- SAFETY NOTE
-- ============================================================================
-- If order_items has existing product_id values that don't exist in products,
-- this migration will FAIL.
--
-- Recovery steps if migration fails:
-- 1. Check for orphaned items:
--    SELECT oi.id, oi.product_id 
--    FROM public.order_items oi
--    LEFT JOIN public.products p ON oi.product_id = p.id
--    WHERE p.id IS NULL AND oi.product_id IS NOT NULL;
--
-- 2. Clean up orphaned items (optional):
--    UPDATE public.order_items 
--    SET product_id = NULL 
--    WHERE product_id NOT IN (SELECT id FROM public.products WHERE id IS NOT NULL);
--
-- 3. Then retry the FK constraint creation above
