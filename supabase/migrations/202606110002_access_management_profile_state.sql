-- Access-management profile shape compatibility.
-- Existing Simba code historically used `user_id` and `default_branch_id`.
-- These additions provide the normalized RBAC fields without breaking existing
-- RLS policies or application code.

alter table if exists public.profiles
  add column if not exists id uuid,
  add column if not exists full_name text,
  add column if not exists avatar_url text,
  add column if not exists branch_id bigint references public.branches(id) on delete set null,
  add column if not exists status text not null default 'active';

update public.profiles
set
  id = coalesce(id, user_id),
  full_name = coalesce(full_name, display_name),
  branch_id = coalesce(branch_id, default_branch_id),
  status = coalesce(nullif(status, ''), 'active')
where id is null
   or full_name is null
   or branch_id is null
   or status is null
   or status = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_id_auth_user_fkey'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_id_auth_user_fkey
      foreign key (id) references auth.users(id) on delete cascade;
  end if;
end $$;

create unique index if not exists idx_profiles_id_unique on public.profiles(id);
create index if not exists idx_profiles_status on public.profiles(status);
create index if not exists idx_profiles_branch_id on public.profiles(branch_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_status_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('active', 'suspended'));
  end if;
end $$;

create or replace function public.is_current_profile_active()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((
    select status = 'active'
    from public.profiles
    where user_id::text = auth.uid()::text
    limit 1
  ), false);
$$;

create or replace function public.current_role()
returns public.store_role
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (
      select
        case
          when coalesce(status, 'active') <> 'active' then 'customer'::public.store_role
          when role::text in ('customer', 'branch_staff', 'branch_manager', 'delivery_agent', 'super_admin')
          then role::text::public.store_role
          else 'customer'::public.store_role
        end
      from public.profiles
      where user_id::text = auth.uid()::text
      limit 1
    ),
    'customer'::public.store_role
  );
$$;

create or replace function public.current_branch_id()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(branch_id, default_branch_id)
  from public.profiles
  where user_id::text = auth.uid()::text
  limit 1;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Simba customer'
  );

  insert into public.profiles (
    id,
    user_id,
    email,
    display_name,
    full_name,
    avatar_url,
    role,
    status
  )
  values (
    new.id,
    new.id,
    new.email,
    v_name,
    v_name,
    new.raw_user_meta_data ->> 'avatar_url',
    'customer'::public.store_role,
    'active'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
