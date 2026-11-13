-- Persistent, private AL OMDA AI chat history (one active conversation per account).
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
