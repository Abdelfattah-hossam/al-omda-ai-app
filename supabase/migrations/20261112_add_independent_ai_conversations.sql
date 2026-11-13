-- Private, independent AI conversations per account.
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
create policy "ai_conversations_select_own"
  on public.ai_conversations for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_conversations_insert_own" on public.ai_conversations;
create policy "ai_conversations_insert_own"
  on public.ai_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_conversations_update_own" on public.ai_conversations;
create policy "ai_conversations_update_own"
  on public.ai_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ai_conversations_delete_own" on public.ai_conversations;
create policy "ai_conversations_delete_own" on public.ai_conversations
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Preserve each account's existing single saved chat as its first conversation.
insert into public.ai_conversations (user_id, title, messages, created_at, updated_at)
select
  old.user_id,
  coalesce(nullif(left(first_user.content, 72), ''), 'محادثة سابقة'),
  old.messages,
  old.updated_at,
  old.updated_at
from public.ai_chat_history old
left join lateral (
  select item->>'content' as content
  from jsonb_array_elements(old.messages) with ordinality as entry(item, position)
  where item->>'role' = 'user'
  order by position
  limit 1
) first_user on true
where jsonb_array_length(old.messages) > 0
  and not exists (
    select 1 from public.ai_conversations existing where existing.user_id = old.user_id
  );
