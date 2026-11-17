-- Preserve already-completed project stages created before executionStatus was recorded.
-- A non-empty persisted result on an approved stage was only written by the successful
-- completion path; explicit failed/pending statuses are never overwritten.
update public.tasks as task
set steps = (
  select jsonb_agg(
    case
      when jsonb_typeof(item.value) = 'object'
       and item.value ->> 'state' = 'approved'
       and nullif(btrim(item.value ->> 'result'), '') is not null
       and nullif(btrim(item.value ->> 'executionStatus'), '') is null
      then item.value || jsonb_build_object('executionStatus', 'succeeded')
      else item.value
    end
    order by item.ordinality
  )
  from jsonb_array_elements(task.steps) with ordinality as item(value, ordinality)
)
where jsonb_typeof(task.steps) = 'array'
  and exists (
    select 1
    from jsonb_array_elements(task.steps) as item(value)
    where jsonb_typeof(item.value) = 'object'
      and item.value ->> 'state' = 'approved'
      and nullif(btrim(item.value ->> 'result'), '') is not null
      and nullif(btrim(item.value ->> 'executionStatus'), '') is null
  );
