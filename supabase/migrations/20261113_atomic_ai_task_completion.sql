create or replace function public.complete_ai_task_step(
  p_task_id uuid,
  p_step_id text,
  p_result text,
  p_executed_at timestamptz,
  p_units integer default 2,
  p_daily_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_reset timestamptz := (((now() at time zone 'utc')::date + 1)::timestamp at time zone 'utc');
  v_steps jsonb;
  v_updated_steps jsonb;
  v_task_status text;
  v_step_index integer;
  v_used integer := 0;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_task_id is null or p_step_id is null or char_length(p_step_id) < 1
     or p_result is null or char_length(p_result) < 1
     or p_executed_at is null or p_units is null or p_units < 1
     or p_units > 5 or p_daily_limit <> 1000 then
    raise exception 'Invalid task completion request';
  end if;

  select steps, status into v_steps, v_task_status
  from public.tasks
  where id = p_task_id and user_id = v_user
  for update;

  if not found then
    return jsonb_build_object('saved', false, 'notFound', true);
  end if;
  if v_task_status in ('paused', 'stopped') then
    return jsonb_build_object('saved', false, 'conflict', true);
  end if;

  select item.ordinality::integer into v_step_index
  from jsonb_array_elements(v_steps) with ordinality as item(value, ordinality)
  where item.value ->> 'id' = p_step_id;

  if v_step_index is null
     or (v_steps -> (v_step_index - 1) ->> 'state') is distinct from 'approved'
     or nullif(v_steps -> (v_step_index - 1) ->> 'result', '') is not null
     or exists (
       select 1
       from jsonb_array_elements(v_steps) with ordinality as item(value, ordinality)
       where item.ordinality < v_step_index
         and item.value ->> 'state' is distinct from 'approved'
     ) then
    return jsonb_build_object('saved', false, 'conflict', true);
  end if;

  select jsonb_agg(
    case when item.ordinality = v_step_index
      then (item.value - 'executionError') || jsonb_build_object(
        'result', p_result,
        'executedAt', p_executed_at,
        'executionStatus', 'succeeded'
      )
      else item.value
    end
    order by item.ordinality
  )
  into v_updated_steps
  from jsonb_array_elements(v_steps) with ordinality as item(value, ordinality);

  insert into public.ai_daily_usage (user_id, usage_date, units)
  values (v_user, v_today, p_units)
  on conflict (user_id, usage_date) do update
    set units = public.ai_daily_usage.units + excluded.units,
        updated_at = now()
    where public.ai_daily_usage.units + excluded.units <= p_daily_limit
  returning units into v_used;

  if not found then
    select units into v_used
    from public.ai_daily_usage
    where user_id = v_user and usage_date = v_today;
    return jsonb_build_object(
      'saved', false,
      'allowed', false,
      'used', coalesce(v_used, 0),
      'remaining', greatest(0, p_daily_limit - coalesce(v_used, 0)),
      'limit', p_daily_limit,
      'resetAt', v_reset
    );
  end if;

  update public.tasks
  set steps = v_updated_steps
  where id = p_task_id and user_id = v_user;

  return jsonb_build_object(
    'saved', true,
    'allowed', true,
    'used', v_used,
    'remaining', greatest(0, p_daily_limit - v_used),
    'limit', p_daily_limit,
    'resetAt', v_reset
  );
end;
$$;

revoke all on function public.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) from public;
grant execute on function public.complete_ai_task_step(uuid, text, text, timestamptz, integer, integer) to authenticated;
