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
    'remaining', greatest(0, 1000 - coalesce(v_used, 0)),
    'limit', 1000,
    'resetAt', v_reset
  );
end;
$$;

create or replace function public.consume_ai_units(p_units integer, p_daily_limit integer default 1000)
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
  if p_units is null or p_units < 1 or p_units > 5 or p_daily_limit <> 1000 then
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

create or replace function public.complete_ai_task_step(
  p_task_id uuid,
  p_step_id text,
  p_result text,
  p_executed_at timestamptz,
  p_units integer default 2,
  p_daily_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_reset timestamptz := (((now() at time zone 'utc')::date + 1)::timestamp at time zone 'utc');
  v_steps jsonb;
  v_updated_steps jsonb;
  v_task_status text;
  v_step_index integer;
  v_used integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_task_id is null or p_step_id is null or char_length(p_step_id) < 1
     or p_result is null or char_length(p_result) < 1
     or p_executed_at is null or p_units is null or p_units < 1
     or p_units > 5 or p_daily_limit <> 1000 then
    raise exception 'Invalid task completion request';
  end if;

  select steps, status into v_steps, v_task_status
  from public.tasks
  where id = p_task_id and user_id = v_user
  for update;

  if not found then
    return jsonb_build_object('saved', false, 'notFound', true);
  end if;
  if v_task_status in ('paused', 'stopped') then
    return jsonb_build_object('saved', false, 'conflict', true);
  end if;

  select item.ordinality::integer into v_step_index
  from jsonb_array_elements(v_steps) with ordinality as item(value, ordinality)
  where item.value ->> 'id' = p_step_id;

  if v_step_index is null
     or (v_steps -> (v_step_index - 1) ->> 'state') is distinct from 'approved'
     or nullif(v_steps -> (v_step_index - 1) ->> 'result', '') is not null
     or exists (
       select 1
       from jsonb_array_elements(v_steps) with ordinality as item(value, ordinality)
       where item.ordinality < v_step_index
         and item.value ->> 'state' is distinct from 'approved'
     ) then
    return jsonb_build_object('saved', false, 'conflict', true);
  end if;

  select jsonb_agg(
    case when item.ordinality = v_step_index
      then (item.value - 'executionError') || jsonb_build_object(
        'result', p_result,
        'executedAt', p_executed_at,
        'executionStatus', 'succeeded'
      )
      else item.value
    end
    order by item.ordinality
  )
  into v_updated_steps
  from jsonb_array_elements(v_steps) with ordinality as item(value, ordinality);

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
      'saved', false,
      'allowed', false,
      'used', coalesce(v_used, 0),
      'remaining', greatest(0, p_daily_limit - coalesce(v_used, 0)),
      'limit', p_daily_limit,
      'resetAt', v_reset
    );
  end if;

  update public.tasks
  set steps = v_updated_steps
  where id = p_task_id and user_id = v_user;

  return jsonb_build_object(
    'saved', true,
    'allowed', true,
    'used', v_used,
    'remaining', greatest(0, p_daily_limit - v_used),
    'limit', p_daily_limit,
    'resetAt', v_reset
  );
end;
$$;

revoke all on function public.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) from public;
grant execute on function public.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) to authenticated;

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


-- Private AI memory used by the chat and profile settings.
create table if not exists public.ai_user_memory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  memory_text text not null default '' check (char_length(memory_text) <= 6000),
  updated_at timestamptz not null default now()
);
alter table public.ai_user_memory enable row level security;
grant select, insert, update, delete on public.ai_user_memory to authenticated;
drop policy if exists "ai_user_memory_select_own" on public.ai_user_memory;
create policy "ai_user_memory_select_own" on public.ai_user_memory
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "ai_user_memory_insert_own" on public.ai_user_memory;
create policy "ai_user_memory_insert_own" on public.ai_user_memory
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "ai_user_memory_update_own" on public.ai_user_memory;
create policy "ai_user_memory_update_own" on public.ai_user_memory
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "ai_user_memory_delete_own" on public.ai_user_memory;
create policy "ai_user_memory_delete_own" on public.ai_user_memory
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Independent private conversations per account (required by the current chat UI).
create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'محادثة جديدة' check (char_length(title) <= 100),
  messages jsonb not null default '[]'::jsonb
    check (jsonb_typeof(messages) = 'array' and jsonb_array_length(messages) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_conversations_user_updated_idx
  on public.ai_conversations (user_id, updated_at desc);
alter table public.ai_conversations enable row level security;
grant select, insert, update, delete on public.ai_conversations to authenticated;
drop policy if exists "ai_conversations_select_own" on public.ai_conversations;
create policy "ai_conversations_select_own" on public.ai_conversations
  for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "ai_conversations_insert_own" on public.ai_conversations;
create policy "ai_conversations_insert_own" on public.ai_conversations
  for insert to authenticated with check ((select auth.uid()) = user_id);
drop policy if exists "ai_conversations_update_own" on public.ai_conversations;
create policy "ai_conversations_update_own" on public.ai_conversations
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "ai_conversations_delete_own" on public.ai_conversations;
create policy "ai_conversations_delete_own" on public.ai_conversations
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Migrate any previous single-thread history into the new conversations table.
insert into public.ai_conversations (user_id, title, messages, created_at, updated_at)
select old.user_id,
  coalesce(nullif(left(first_user.content, 72), ''), 'محادثة سابقة'),
  old.messages, old.updated_at, old.updated_at
from public.ai_chat_history old
left join lateral (
  select item->>'content' as content
  from jsonb_array_elements(old.messages) with ordinality as entry(item, position)
  where item->>'role' = 'user'
  order by position limit 1
) first_user on true
where jsonb_array_length(old.messages) > 0
  and not exists (
    select 1 from public.ai_conversations existing where existing.user_id = old.user_id
  );
