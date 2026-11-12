-- AL OMDA AI: user-scoped profile/task data and private avatar storage.
-- Run this once in the Supabase SQL Editor for the project used by the API.
-- This script creates/updates schema and policies; it does not delete user data.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  organization text not null default '',
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  request text not null check (char_length(request) between 1 and 10000),
  specialty text not null check (specialty in ('business', 'development', 'design', 'marketing', 'research', 'assistant')),
  steps jsonb not null check (jsonb_typeof(steps) = 'array'),
  status text not null check (status in ('review', 'paused', 'approved', 'stopped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_user_created_at_idx
  on public.tasks (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.create_profile_for_new_user();

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "tasks_select_own" on public.tasks;
create policy "tasks_select_own"
  on public.tasks for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "tasks_insert_own" on public.tasks;
create policy "tasks_insert_own"
  on public.tasks for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_update_own" on public.tasks;
create policy "tasks_update_own"
  on public.tasks for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "tasks_delete_own" on public.tasks;
create policy "tasks_delete_own"
  on public.tasks for delete to authenticated
  using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'user-avatars',
  'user-avatars',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "user_avatars_select_own" on storage.objects;
create policy "user_avatars_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "user_avatars_insert_own" on storage.objects;
create policy "user_avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "user_avatars_update_own" on storage.objects;
create policy "user_avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "user_avatars_delete_own" on storage.objects;
create policy "user_avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'user-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );


-- Daily AI allowance. Usage is shared across all configured free providers per user.
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;
grant select on public.ai_daily_usage to authenticated;

drop policy if exists "ai_daily_usage_select_own" on public.ai_daily_usage;
create policy "ai_daily_usage_select_own"
  on public.ai_daily_usage for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_ai_daily_usage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_used integer := 0;
  v_reset timestamptz := ((v_today + 1)::timestamp at time zone 'utc');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  select units into v_used
  from public.ai_daily_usage
  where user_id = v_user and usage_date = v_today;
  return jsonb_build_object(
    'used', coalesce(v_used, 0),
    'remaining', greatest(0, 100 - coalesce(v_used, 0)),
    'limit', 100,
    'resetAt', v_reset
  );
end;
$$;

create or replace function public.consume_ai_units(p_units integer, p_daily_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_used integer := 0;
  v_reset timestamptz := ((v_today + 1)::timestamp at time zone 'utc');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_units is null or p_units < 1 or p_units > 5 or p_daily_limit <> 100 then
    raise exception 'Invalid AI quota request';
  end if;

  insert into public.ai_daily_usage (user_id, usage_date, units)
  values (v_user, v_today, p_units)
  on conflict (user_id, usage_date) do update
    set units = public.ai_daily_usage.units + excluded.units,
        updated_at = now()
    where public.ai_daily_usage.units + excluded.units <= p_daily_limit
  returning units into v_used;

  if not found then
    select units into v_used
    from public.ai_daily_usage
    where user_id = v_user and usage_date = v_today;
    return jsonb_build_object(
      'allowed', false,
      'used', coalesce(v_used, 0),
      'remaining', greatest(0, p_daily_limit - coalesce(v_used, 0)),
      'limit', p_daily_limit,
      'resetAt', v_reset
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'remaining', greatest(0, p_daily_limit - v_used),
    'limit', p_daily_limit,
    'resetAt', v_reset
  );
end;
$$;

revoke all on function public.get_ai_daily_usage() from public;
revoke all on function public.consume_ai_units(integer, integer) from public;
grant execute on function public.get_ai_daily_usage() to authenticated;
grant execute on function public.consume_ai_units(integer, integer) to authenticated;

-- Persistent, private AI chat history (one active conversation per account).
create table if not exists public.ai_chat_history (
  user_id uuid primary key references auth.users (id) on delete cascade,
  messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 100),
  updated_at timestamptz not null default now()
);

alter table public.ai_chat_history enable row level security;
grant select, insert, update, delete on public.ai_chat_history to authenticated;

drop policy if exists "ai_chat_history_select_own" on public.ai_chat_history;
create policy "ai_chat_history_select_own"
  on public.ai_chat_history for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_chat_history_insert_own" on public.ai_chat_history;
create policy "ai_chat_history_insert_own"
  on public.ai_chat_history for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_chat_history_update_own" on public.ai_chat_history;
create policy "ai_chat_history_update_own"
  on public.ai_chat_history for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_chat_history_delete_own" on public.ai_chat_history;
create policy "ai_chat_history_delete_own"
  on public.ai_chat_history for delete to authenticated
  using ((select auth.uid()) = user_id);
