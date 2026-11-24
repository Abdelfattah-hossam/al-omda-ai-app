-- Account deletion for the signed-in caller only. Cascades remove the user's rows.
create or replace function public.omda_delete_my_account()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated' using errcode = '28000'; end if;
  if exists (select 1 from public.app_admins where user_id = uid) then
    raise exception 'admin accounts cannot be deleted here' using errcode = '42501';
  end if;
  delete from public.app_account_controls where user_id = uid;
  delete from public.app_recovery_tickets where target_id = uid or issuer_id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.omda_delete_my_account() from public, anon;
grant execute on function public.omda_delete_my_account() to authenticated;

-- Definition captured from the live database so the repo matches it.
create or replace function public.get_global_user_analytics()
returns jsonb
language sql
stable
security definer
set search_path to 'pg_catalog', 'auth'
as $function$
  with counts as (
    select
      count(*) filter (where last_sign_in_at >= now() - interval '30 days')::bigint as active_users_30d,
      count(*) filter (where last_sign_in_at >= now() - interval '60 days'
                         and last_sign_in_at < now() - interval '30 days')::bigint as active_users_previous_30d
    from auth.users
    where deleted_at is null
  )
  select jsonb_build_object(
    'active_users_30d', active_users_30d,
    'active_users_previous_30d', active_users_previous_30d,
    'growth_percent',
      case when active_users_previous_30d = 0 then null
           else round(((active_users_30d - active_users_previous_30d)::numeric
                       / active_users_previous_30d::numeric) * 100, 2)
      end,
    'measured_at', now()
  )
  from counts;
$function$;
