create table if not exists public.collaboration_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('contact', 'event', 'ticket')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved')),
  due_at timestamptz,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 8192),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collaboration_records_id_user_id_unique unique (id, user_id)
);

create index if not exists collaboration_records_user_kind_created_idx on public.collaboration_records (user_id, kind, created_at desc);
create index if not exists collaboration_records_user_due_idx on public.collaboration_records (user_id, due_at) where due_at is not null;

alter table public.collaboration_records enable row level security;
revoke all on table public.collaboration_records from public, anon, authenticated;
grant select, insert, update, delete on table public.collaboration_records to authenticated;

create policy "Users can read their own collaboration records" on public.collaboration_records for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can create their own collaboration records" on public.collaboration_records for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own collaboration records" on public.collaboration_records for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own collaboration records" on public.collaboration_records for delete to authenticated using ((select auth.uid()) = user_id);
