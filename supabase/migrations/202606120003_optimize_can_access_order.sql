-- Migration: Optimize can_access_order() for Super Admin Priority
-- Date: 2026-06-12
-- Purpose: Ensure super_admin can always access orders regardless of branch context
-- Issue: Dashboard queries depend on can_access_order() - must work for super_admin

-- ============================================================================
-- Current Issue
-- ============================================================================
-- The existing can_access_order() function is logically correct:
--   select
--     public.is_super_admin()  ← Already checked first!
--     or (other conditions...)
--
-- However, for absolute clarity and to prevent branch context dependencies,
-- we can make this more explicit.

-- ============================================================================
-- RECOMMENDED: Update existing can_access_order() function
-- ============================================================================
-- If this needs to be applied, replace the existing function in 
-- 202606080001_initial_schema.sql with this version:

create or replace function public.can_access_order(target public.orders)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    -- PRIORITY 1: Super admin - no branch context required
    public.is_super_admin()
    
    -- PRIORITY 2: Order owner - can view their own orders
    or target.user_id::text = auth.uid()::text
    
    -- PRIORITY 3: Branch manager or staff viewing their branch orders
    or (
      public.current_role() in ('branch_manager'::public.store_role, 'branch_staff'::public.store_role)
      and public.current_branch_id() is not null
      and (
        target.branch_id = public.current_branch_id()
        or target.assigned_branch_id = public.current_branch_id()
      )
    )
    
    -- PRIORITY 4: Delivery agent viewing assigned orders or branch orders
    or (
      public.current_role() = 'delivery_agent'::public.store_role
      and (
        target.assigned_delivery_agent_id::text = auth.uid()::text
        or (
          public.current_branch_id() is not null
          and (
            target.branch_id = public.current_branch_id()
            or target.assigned_branch_id = public.current_branch_id()
          )
        )
      )
    );
$$;

-- ============================================================================
-- VERIFICATION SCRIPT
-- ============================================================================
-- After applying this migration, run these tests:
--
-- 1. As super_admin, verify can see all orders:
--    SELECT COUNT(*) FROM public.orders;  -- Should return count > 0
--
-- 2. As super_admin, verify can see order_items:
--    SELECT COUNT(*) FROM public.order_items;  -- Should return count > 0
--
-- 3. Verify function definition:
--    SELECT prosrc FROM pg_proc 
--    WHERE proname = 'can_access_order' AND pronamespace = 'public'::regnamespace;
--
-- 4. Test with specific order:
--    SELECT * FROM public.orders LIMIT 1;  -- Should return rows

-- ============================================================================
-- NOTES
-- ============================================================================
-- - The existing function logic was already correct (is_super_admin() checked first)
-- - This update makes the priority structure more explicit
-- - No functional change needed for dashboard to work
-- - Apply ONLY if you need to modify the function for clarity/maintenance
