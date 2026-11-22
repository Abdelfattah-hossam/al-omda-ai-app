-- Allow concise plans without padding them to three steps.
-- Changes only the step-count guard in the existing owner-scoped, quota-checked RPC.
-- The public function is a wrapper; the private implementation owns this guard.
-- Existing task data, quota accounting and function attributes are preserved.
begin;
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('omda_private.create_ai_task_with_quota(text,text,text,jsonb,integer)'::regprocedure)
    into definition;
  if position('jsonb_array_length(p_steps) not between 3 and 8' in definition) > 0 then
    execute replace(definition,
      'jsonb_array_length(p_steps) not between 3 and 8',
      'jsonb_array_length(p_steps) not between 1 and 8');
  elsif position('jsonb_array_length(p_steps) not between 1 and 8' in definition) = 0 then
    raise exception 'Unrecognized project-plan guard; migration stopped without changing the RPC';
  end if;
end;
$migration$;
revoke all on function public.create_ai_task_with_quota(text,text,text,jsonb,integer) from public, anon;
grant execute on function public.create_ai_task_with_quota(text,text,text,jsonb,integer) to authenticated;
commit;
