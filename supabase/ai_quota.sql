-- Daily AI allowance. Usage is shared across all configured free providers per user.
create table if not exists public.ai_daily_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_date date not null,
  units integer not null default 0 check (units >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_daily_usage enable row level security;
grant select on public.ai_daily_usage to authenticated;

drop policy if exists "ai_daily_usage_select_own" on public.ai_daily_usage;
create policy "ai_daily_usage_select_own"
  on public.ai_daily_usage for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_ai_daily_usage()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_used integer := 0;
  v_reset timestamptz := ((v_today + 1)::timestamp at time zone 'utc');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  select units into v_used
  from public.ai_daily_usage
  where user_id = v_user and usage_date = v_today;
  return jsonb_build_object(
    'used', coalesce(v_used, 0),
    'remaining', greatest(0, 100 - coalesce(v_used, 0)),
    'limit', 1000,
    'resetAt', v_reset
  );
end;
$$;

create or replace function public.consume_ai_units(p_units integer, p_daily_limit integer default 1000)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'utc')::date;
  v_used integer := 0;
  v_reset timestamptz := ((v_today + 1)::timestamp at time zone 'utc');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if p_units is null or p_units < 1 or p_units > 5 or p_daily_limit <> 1000 then
    raise exception 'Invalid AI quota request';
  end if;

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
      'allowed', false,
      'used', coalesce(v_used, 0),
      'remaining', greatest(0, p_daily_limit - coalesce(v_used, 0)),
      'limit', p_daily_limit,
      'resetAt', v_reset
    );
  end if;

  return jsonb_build_object(
    'allowed', true,
    'used', v_used,
    'remaining', greatest(0, p_daily_limit - v_used),
    'limit', p_daily_limit,
    'resetAt', v_reset
  );
end;
$$;

revoke all on function public.get_ai_daily_usage() from public;
revoke all on function public.consume_ai_units(integer, integer) from public;
grant execute on function public.get_ai_daily_usage() to authenticated;
grant execute on function public.consume_ai_units(integer, integer) to authenticated;
