create index if not exists ai_memory_edges_source_fk_idx
  on public.ai_memory_edges (source_node_id, user_id);
create index if not exists ai_memory_edges_target_fk_idx
  on public.ai_memory_edges (target_node_id, user_id);
