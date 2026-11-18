-- Keep the memory generation trigger function on a trusted search path.
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
