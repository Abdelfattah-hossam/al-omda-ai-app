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

-- Keep privileged quota/task implementations outside the exposed Data API schema.
create schema if not exists omda_private;
revoke all on schema omda_private from public, anon;
grant usage on schema omda_private to authenticated;

create or replace function omda_private.get_ai_daily_usage()
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
 
create or replace function public.get_ai_daily_usage()
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select omda_private.get_ai_daily_usage();
$$;
revoke all on function omda_private.get_ai_daily_usage() from public, anon;
grant execute on function omda_private.get_ai_daily_usage() to authenticated;


create or replace function omda_private.consume_ai_units(p_units integer, p_daily_limit integer default 1000)
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
  if p_units is null or p_units < 1 or p_units > 5 or p_daily_limit is distinct from 1000 then
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
 
create or replace function public.consume_ai_units(p_units integer, p_daily_limit integer default 1000)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select omda_private.consume_ai_units(p_units, p_daily_limit);
$$;
revoke all on function omda_private.consume_ai_units(integer, integer) from public, anon;
grant execute on function omda_private.consume_ai_units(integer, integer) to authenticated;


create or replace function omda_private.complete_ai_task_step(
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
  if p_task_id is null
     or p_step_id is null or char_length(p_step_id) not between 1 and 80
     or p_result is null or char_length(btrim(p_result)) < 1 or octet_length(p_result) > 500000
     or p_executed_at is null
     or p_units is distinct from 2
     or p_daily_limit is distinct from 1000 then
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
         and (
           item.value ->> 'state' is distinct from 'approved'
           or item.value ->> 'executionStatus' is distinct from 'succeeded'
           or nullif(btrim(item.value ->> 'result'), '') is null
         )
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
 
create or replace function public.complete_ai_task_step(
  p_task_id uuid,
  p_step_id text,
  p_result text,
  p_executed_at timestamptz,
  p_units integer default 2,
  p_daily_limit integer default 1000
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select omda_private.complete_ai_task_step(p_task_id, p_step_id, p_result, p_executed_at, p_units, p_daily_limit);
$$;
revoke all on function omda_private.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) from public, anon;
grant execute on function omda_private.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) to authenticated;


revoke all on function public.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) from public, anon;
grant execute on function public.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) to authenticated;

revoke all on function public.get_ai_daily_usage() from public, anon;
revoke all on function public.consume_ai_units(integer, integer) from public, anon;
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

-- Private, user-scoped memory graph. The composite foreign keys prevent cross-account edges.
create table if not exists public.ai_memory_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  node_type text not null check (node_type in ('preference','project','decision','constraint','correction','person','organization','tool','other')),
  label text not null check (char_length(label) between 1 and 160),
  normalized_label text not null check (char_length(normalized_label) between 1 and 180),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192),
  source text not null default 'user_confirmed' check (source in ('user_confirmed','conversation_confirmed','imported')),
  confidence numeric not null default 1.00 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, node_type, normalized_label)
);
create index if not exists ai_memory_nodes_user_type_updated_idx
  on public.ai_memory_nodes (user_id, node_type, updated_at desc);
alter table public.ai_memory_nodes enable row level security;
revoke all on public.ai_memory_nodes from public, anon;
grant select, insert, update, delete on public.ai_memory_nodes to authenticated;
drop policy if exists "ai_memory_nodes_user_all" on public.ai_memory_nodes;
create policy "ai_memory_nodes_user_all" on public.ai_memory_nodes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.ai_memory_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_node_id uuid not null,
  target_node_id uuid not null,
  relation text not null check (relation in ('prefers','owns','works_on','decided','constrained_by','corrected','related_to','member_of','uses','created')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4096),
  source text not null default 'user_confirmed' check (source in ('user_confirmed','conversation_confirmed','imported')),
  confidence numeric not null default 1.00 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  check (source_node_id <> target_node_id),
  foreign key (source_node_id, user_id) references public.ai_memory_nodes(id, user_id) on delete cascade,
  foreign key (target_node_id, user_id) references public.ai_memory_nodes(id, user_id) on delete cascade,
  unique (user_id, source_node_id, target_node_id, relation)
);
create index if not exists ai_memory_edges_user_source_idx
  on public.ai_memory_edges (user_id, source_node_id);
create index if not exists ai_memory_edges_user_target_idx
  on public.ai_memory_edges (user_id, target_node_id);
create index if not exists ai_memory_edges_source_fk_idx
  on public.ai_memory_edges (source_node_id, user_id);
create index if not exists ai_memory_edges_target_fk_idx
  on public.ai_memory_edges (target_node_id, user_id);
alter table public.ai_memory_edges enable row level security;
revoke all on public.ai_memory_edges from public, anon;
grant select, insert, update, delete on public.ai_memory_edges to authenticated;
drop policy if exists "ai_memory_edges_user_all" on public.ai_memory_edges;
create policy "ai_memory_edges_user_all" on public.ai_memory_edges
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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


-- Create a project task and charge its planning unit in one transaction.
-- If task insertion fails, PostgreSQL rolls back the quota write as well.
create or replace function omda_private.create_ai_task_with_quota(
  p_title text,
  p_request text,
  p_specialty text,
  p_steps jsonb,
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
  v_used integer := 0;
  v_task public.tasks%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_daily_limit is distinct from 1000
     or p_title is null or char_length(btrim(p_title)) not between 1 and 160
     or p_request is null or char_length(btrim(p_request)) not between 1 and 10000
     or p_specialty is null
     or p_specialty not in ('business', 'development', 'design', 'marketing', 'research', 'assistant')
     or jsonb_typeof(p_steps) is distinct from 'array'
     or jsonb_array_length(p_steps) not between 3 and 8 then
    raise exception 'Invalid project task request';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
       or coalesce(char_length(item.value ->> 'id'), 0) not between 1 and 80
       or coalesce(char_length(btrim(item.value ->> 'text')), 0) not between 1 and 1200
       or coalesce(char_length(btrim(item.value ->> 'output')), 0) not between 1 and 1200
       or coalesce(char_length(btrim(item.value ->> 'complete')), 0) not between 1 and 1200
       or item.value ->> 'state' is distinct from 'pending'
       or item.value ?| array['result', 'executedAt', 'executionStatus', 'executionError']
  ) or (
    select count(distinct item.value ->> 'id')
    from jsonb_array_elements(p_steps) as item(value)
  ) <> jsonb_array_length(p_steps) then
    raise exception 'Invalid project task steps';
  end if;

  insert into public.ai_daily_usage (user_id, usage_date, units)
  values (v_user, v_today, 1)
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

  insert into public.tasks (user_id, title, request, specialty, steps, status)
  values (v_user, btrim(p_title), btrim(p_request), p_specialty, p_steps, 'review')
  returning * into v_task;

  return jsonb_build_object(
    'saved', true,
    'allowed', true,
    'task', to_jsonb(v_task),
    'used', v_used,
    'remaining', greatest(0, p_daily_limit - v_used),
    'limit', p_daily_limit,
    'resetAt', v_reset
  );
end;
$$;
 
create or replace function public.create_ai_task_with_quota(
  p_title text,
  p_request text,
  p_specialty text,
  p_steps jsonb,
  p_daily_limit integer default 1000
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select omda_private.create_ai_task_with_quota(p_title, p_request, p_specialty, p_steps, p_daily_limit);
$$;
revoke all on function omda_private.create_ai_task_with_quota(text, text, text, jsonb, integer) from public, anon;
grant execute on function omda_private.create_ai_task_with_quota(text, text, text, jsonb, integer) to authenticated;


revoke all on function public.create_ai_task_with_quota(text, text, text, jsonb, integer) from public, anon;
grant execute on function public.create_ai_task_with_quota(text, text, text, jsonb, integer) to authenticated;

-- Private workspace files and project attachments.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-assets',
  'workspace-assets',
  false,
  26214400,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/json',
    'text/html',
    'application/xml',
    'application/zip',
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "workspace_assets_select_own" on storage.objects;
create policy "workspace_assets_select_own"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "workspace_assets_insert_own" on storage.objects;
create policy "workspace_assets_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "workspace_assets_update_own" on storage.objects;
create policy "workspace_assets_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "workspace_assets_delete_own" on storage.objects;
create policy "workspace_assets_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'workspace-assets'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Final least-privilege hardening for the manual bootstrap path.
-- Keep client access explicit and prevent future postgres-owned public objects
-- from inheriting broad Supabase defaults.
revoke execute on all functions in schema public from public, anon;
grant execute on function public.get_ai_daily_usage() to authenticated;
grant execute on function public.consume_ai_units(integer, integer) to authenticated;
grant execute on function public.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) to authenticated;
grant execute on function public.create_ai_task_with_quota(text, text, text, jsonb, integer) to authenticated;

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon;
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated, service_role;


-- Keep the canonical setup in sync with the private-memory generation fence migration.
-- Prevent an in-flight chat response from recreating private memory after the user clears it.
create table if not exists public.ai_memory_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation uuid not null default gen_random_uuid(),
  updated_at timestamptz not null default now()
);

alter table public.ai_memory_state enable row level security;

drop policy if exists "Users can read own AI memory state" on public.ai_memory_state;
create policy "Users can read own AI memory state"
  on public.ai_memory_state for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert own AI memory state" on public.ai_memory_state;
create policy "Users can insert own AI memory state"
  on public.ai_memory_state for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own AI memory state" on public.ai_memory_state;
create policy "Users can update own AI memory state"
  on public.ai_memory_state for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.ai_memory_state from public, anon;
grant select, insert, update on public.ai_memory_state to authenticated;

insert into public.ai_memory_state (user_id)
select distinct user_id from public.ai_memory_nodes
on conflict (user_id) do nothing;

alter table public.ai_memory_nodes
  add column if not exists memory_generation uuid;

update public.ai_memory_nodes as nodes
set memory_generation = state.generation
from public.ai_memory_state as state
where state.user_id = nodes.user_id
  and nodes.memory_generation is null;

alter table public.ai_memory_nodes
  alter column memory_generation set not null;

create or replace function public.enforce_ai_memory_generation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  current_generation uuid;
begin
  select generation
    into current_generation
    from public.ai_memory_state
   where user_id = new.user_id
   for share;

  if current_generation is null or new.memory_generation is distinct from current_generation then
    raise exception 'Stale or missing AI memory generation'
      using errcode = '40001';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_ai_memory_generation() from public, anon, authenticated;

drop trigger if exists ai_memory_nodes_generation_guard on public.ai_memory_nodes;
create trigger ai_memory_nodes_generation_guard
  before insert or update on public.ai_memory_nodes
  for each row execute function public.enforce_ai_memory_generation();


-- Keep the canonical setup in sync with quota-free chat artifact task logging.
-- Record files created directly in chat without charging a second AI task-creation unit.
create or replace function public.create_ai_artifact_task(
  p_title text,
  p_request text,
  p_specialty text,
  p_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_language text default 'ar'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_task public.tasks%rowtype;
  v_now timestamptz := now();
  v_is_ar boolean := coalesce(p_language, 'ar') <> 'en';
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_title is null or char_length(btrim(p_title)) < 1 or char_length(p_title) > 160
     or p_request is null or char_length(p_request) < 1 or char_length(p_request) > 10000
     or p_specialty is null or p_specialty not in ('business', 'development', 'design', 'marketing', 'research', 'assistant')
     or p_filename is null or char_length(p_filename) < 1 or char_length(p_filename) > 120
     or position('/' in p_filename) > 0 or position(chr(92) in p_filename) > 0 or p_filename ~ '[[:cntrl:]]'
     or p_mime_type is null or p_mime_type not in (
       'application/pdf',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
       'application/vnd.openxmlformats-officedocument.presentationml.presentation',
       'text/plain', 'text/markdown', 'text/csv', 'application/json', 'text/javascript',
       'text/x-python', 'application/sql', 'text/css', 'application/dxf',
       'text/html', 'application/xml', 'application/zip',
       'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'
     )
     or p_file_size is null or p_file_size < 1 or p_file_size > 26214400
     or p_language is null or p_language not in ('ar', 'en') then
    raise exception 'Invalid generated artifact metadata' using errcode = '22023';
  end if;

  insert into public.tasks (user_id, title, request, specialty, steps, status)
  values (
    v_user_id,
    btrim(p_title),
    left(btrim(p_request) || E'\n\nGenerated artifact: ' || p_filename || ' (' || p_mime_type || ', ' || p_file_size::text || ' bytes). Logged from chat; no additional AI execution was requested.', 10000),
    p_specialty,
    jsonb_build_array(
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', case when v_is_ar then 'تجهيز محتوى الملف' else 'Prepare file content' end,
        'output', p_filename,
        'complete', case when v_is_ar then 'تم تجهيز المحتوى المطلوب' else 'Requested content is prepared' end,
        'state', 'approved',
        'result', case when v_is_ar then 'تم تجهيز المحتوى من أحدث طلب في المحادثة.' else 'Content was prepared from the latest chat request.' end,
        'executedAt', v_now,
        'executionStatus', 'succeeded'
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', case when v_is_ar then 'إنشاء الملف الفعلي' else 'Generate the actual file' end,
        'output', p_filename,
        'complete', case when v_is_ar then 'تم إنشاء ملف قابل للتنزيل' else 'A downloadable file was created' end,
        'state', 'approved',
        'result', case when v_is_ar then 'تم إنشاء ' || p_filename || ' بحجم ' || p_file_size::text || ' بايت.' else 'Created ' || p_filename || ' (' || p_file_size::text || ' bytes).' end,
        'executedAt', v_now,
        'executionStatus', 'succeeded'
      ),
      jsonb_build_object(
        'id', gen_random_uuid()::text,
        'text', case when v_is_ar then 'إرفاق الملف وتسجيله في سجل المهام' else 'Attach the file and record it in Task History' end,
        'output', p_filename,
        'complete', case when v_is_ar then 'ظهر الملف في المحادثة وله سجل مهمة دائم' else 'The file is attached in chat and has a persistent task log' end,
        'state', 'approved',
        'result', case when v_is_ar then 'تم ربط الملف بسجل المهام.' else 'The file was linked to Task History.' end,
        'executedAt', v_now,
        'executionStatus', 'succeeded'
      )
    ),
    'approved'
  )
  returning * into v_task;

  return to_jsonb(v_task);
end;
$$;

revoke all on function public.create_ai_artifact_task(text, text, text, text, text, bigint, text) from public, anon, authenticated;
grant execute on function public.create_ai_artifact_task(text, text, text, text, text, bigint, text) to authenticated;
