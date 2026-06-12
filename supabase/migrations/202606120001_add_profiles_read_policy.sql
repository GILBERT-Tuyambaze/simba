-- Migration: Add Profiles Read Policy for Staff Access
-- Date: 2026-06-12
-- Purpose: Allow branch staff, managers, and delivery agents to query profiles for staff/delivery assignment
-- Issue: Dashboard staff assignment dropdowns are empty because SELECT policy doesn't exist

-- ============================================================================
-- Remove old/incorrect policies if they exist
-- ============================================================================
drop policy if exists "profiles staff read" on public.profiles;
drop policy if exists "profiles read" on public.profiles;

-- ============================================================================
-- Add: Profiles Read Policy for Staff
-- ============================================================================
-- Allow:
-- 1. Super admin: unconditional read
-- 2. Branch staff/managers: read profiles in their branch OR unassigned profiles (NULL branch)
-- 3. Delivery agents: read profiles in their branch OR unassigned profiles
-- 4. Users: read their own profile
create policy "profiles staff read" on public.profiles
for select using (
  -- Priority 1: Super admin can see all profiles
  public.is_super_admin()
  
  -- Priority 2: Staff/delivery agents can see profiles in their branch or unassigned
  or (
    public.current_role() in ('branch_manager'::public.store_role, 'branch_staff'::public.store_role, 'delivery_agent'::public.store_role)
    and (
      -- Can see profiles assigned to their branch
      default_branch_id = public.current_branch_id()
      -- Can see unassigned profiles (NULL branch)
      or default_branch_id IS NULL
    )
  )
  
  -- Priority 3: Users can always see their own profile
  or user_id::text = auth.uid()::text
);

-- ============================================================================
-- Enable RLS on profiles table (should already be enabled from initial schema)
-- ============================================================================
alter table public.profiles enable row level security;

-- ============================================================================
-- Verify policies exist
-- ============================================================================
-- Run this query to verify the policy was created:
-- SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'profiles'
-- ORDER BY policyname;
