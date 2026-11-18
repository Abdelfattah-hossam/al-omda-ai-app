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
set search_path = public, pg_temp
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
