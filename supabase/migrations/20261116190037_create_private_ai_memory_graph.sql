-- Private, user-scoped knowledge graph for confirmed AL OMDA memory.
-- Only authenticated users can access their own nodes and edges. No anonymous access.

create table if not exists public.ai_memory_nodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  node_type text not null check (node_type in ('preference', 'project', 'decision', 'constraint', 'correction', 'person', 'organization', 'tool', 'other')),
  label text not null check (char_length(label) between 1 and 160),
  normalized_label text not null check (char_length(normalized_label) between 1 and 180),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 8192),
  source text not null default 'user_confirmed'
    check (source in ('user_confirmed', 'conversation_confirmed', 'imported')),
  confidence numeric(3,2) not null default 1.00 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, node_type, normalized_label),
  unique (id, user_id)
);

create table if not exists public.ai_memory_edges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_node_id uuid not null,
  target_node_id uuid not null,
  relation text not null check (relation in ('prefers', 'owns', 'works_on', 'decided', 'constrained_by', 'corrected', 'related_to', 'member_of', 'uses', 'created')),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object' and pg_column_size(details) <= 4096),
  source text not null default 'user_confirmed'
    check (source in ('user_confirmed', 'conversation_confirmed', 'imported')),
  confidence numeric(3,2) not null default 1.00 check (confidence between 0 and 1),
  created_at timestamptz not null default now(),
  check (source_node_id <> target_node_id),
  unique (user_id, source_node_id, target_node_id, relation),
  foreign key (source_node_id, user_id)
    references public.ai_memory_nodes (id, user_id) on delete cascade,
  foreign key (target_node_id, user_id)
    references public.ai_memory_nodes (id, user_id) on delete cascade
);

create index if not exists ai_memory_nodes_user_type_updated_idx
  on public.ai_memory_nodes (user_id, node_type, updated_at desc);
create index if not exists ai_memory_edges_user_source_idx
  on public.ai_memory_edges (user_id, source_node_id);
create index if not exists ai_memory_edges_user_target_idx
  on public.ai_memory_edges (user_id, target_node_id);

alter table public.ai_memory_nodes enable row level security;
alter table public.ai_memory_edges enable row level security;

revoke all on public.ai_memory_nodes from public, anon;
revoke all on public.ai_memory_edges from public, anon;
grant select, insert, update, delete on public.ai_memory_nodes to authenticated;
grant select, insert, update, delete on public.ai_memory_edges to authenticated;

drop policy if exists ai_memory_nodes_user_all on public.ai_memory_nodes;
create policy ai_memory_nodes_user_all
  on public.ai_memory_nodes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists ai_memory_edges_user_all on public.ai_memory_edges;
create policy ai_memory_edges_user_all
  on public.ai_memory_edges for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
