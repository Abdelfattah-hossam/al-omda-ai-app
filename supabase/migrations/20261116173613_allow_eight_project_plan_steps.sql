
create or replace function public.create_ai_task_with_quota(
  p_title text,
  p_request text,
  p_specialty text,
  p_steps jsonb,
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
  v_used integer := 0;
  v_task public.tasks%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_daily_limit is distinct from 1000
     or p_title is null or char_length(btrim(p_title)) not between 1 and 160
     or p_request is null or char_length(btrim(p_request)) not between 1 and 10000
     or p_specialty is null
     or p_specialty not in ('business', 'development', 'design', 'marketing', 'research', 'assistant')
     or jsonb_typeof(p_steps) is distinct from 'array'
     or jsonb_array_length(p_steps) not between 3 and 8 then
    raise exception 'Invalid project task request';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_steps) as item(value)
    where jsonb_typeof(item.value) is distinct from 'object'
       or coalesce(char_length(item.value ->> 'id'), 0) not between 1 and 80
       or coalesce(char_length(btrim(item.value ->> 'text')), 0) not between 1 and 1200
       or coalesce(char_length(btrim(item.value ->> 'output')), 0) not between 1 and 1200
       or coalesce(char_length(btrim(item.value ->> 'complete')), 0) not between 1 and 1200
       or item.value ->> 'state' is distinct from 'pending'
       or item.value ?| array['result', 'executedAt', 'executionStatus', 'executionError']
  ) or (
    select count(distinct item.value ->> 'id')
    from jsonb_array_elements(p_steps) as item(value)
  ) <> jsonb_array_length(p_steps) then
    raise exception 'Invalid project task steps';
  end if;

  insert into public.ai_daily_usage (user_id, usage_date, units)
  values (v_user, v_today, 1)
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

  insert into public.tasks (user_id, title, request, specialty, steps, status)
  values (v_user, btrim(p_title), btrim(p_request), p_specialty, p_steps, 'review')
  returning * into v_task;

  return jsonb_build_object(
    'saved', true,
    'allowed', true,
    'task', to_jsonb(v_task),
    'used', v_used,
    'remaining', greatest(0, p_daily_limit - v_used),
    'limit', p_daily_limit,
    'resetAt', v_reset
  );
end;
$$;

revoke all on function public.create_ai_task_with_quota(text, text, text, jsonb, integer) from public;
grant execute on function public.create_ai_task_with_quota(text, text, text, jsonb, integer) to authenticated;
