-- Optional rollback for the concise-plan guard. Existing tasks are not changed.
-- Roll back the matching app/API validation release before applying this file.
begin;
do $migration$
declare
  definition text;
begin
  select pg_get_functiondef('omda_private.create_ai_task_with_quota(text,text,text,jsonb,integer)'::regprocedure)
    into definition;
  if position('jsonb_array_length(p_steps) not between 1 and 8' in definition) > 0 then
    execute replace(definition,
      'jsonb_array_length(p_steps) not between 1 and 8',
      'jsonb_array_length(p_steps) not between 3 and 8');
  elsif position('jsonb_array_length(p_steps) not between 3 and 8' in definition) = 0 then
    raise exception 'Unrecognized project-plan guard; rollback stopped without changing the RPC';
  end if;
end;
$migration$;
commit;
