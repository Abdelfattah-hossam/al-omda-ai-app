-- Private, user-controlled memory for AL OMDA AI.
-- Run this migration once in the Supabase SQL Editor.

create table if not exists public.ai_user_memory (
  user_id uuid primary key references auth.users (id) on delete cascade,
  memory_text text not null default '' check (char_length(memory_text) <= 6000),
  updated_at timestamptz not null default now()
);

alter table public.ai_user_memory enable row level security;
grant select, insert, update, delete on public.ai_user_memory to authenticated;

drop policy if exists "ai_user_memory_select_own" on public.ai_user_memory;
create policy "ai_user_memory_select_own"
  on public.ai_user_memory for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_user_memory_insert_own" on public.ai_user_memory;
create policy "ai_user_memory_insert_own"
  on public.ai_user_memory for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_user_memory_update_own" on public.ai_user_memory;
create policy "ai_user_memory_update_own"
  on public.ai_user_memory for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_user_memory_delete_own" on public.ai_user_memory;
create policy "ai_user_memory_delete_own"
  on public.ai_user_memory for delete to authenticated
  using ((select auth.uid()) = user_id);
