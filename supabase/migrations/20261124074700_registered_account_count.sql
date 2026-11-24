begin;
-- Registrations and measured app opens are intentionally separate metrics.
create or replace function public.omda_presence_stats() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare total_count bigint; online_count bigint; registered_count bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.app_admins where user_id=auth.uid()) or exists(select 1 from public.app_account_controls where user_id=auth.uid() and suspended) then
  raise exception 'Admin access denied' using errcode='42501';
 end if;
 select count(*) into registered_count from auth.users;
 select count(*),count(*) filter(where p.last_seen_at > now()-interval '120 seconds'
  and not exists(select 1 from public.app_account_controls c where c.user_id=p.user_id and c.suspended))
 into total_count,online_count from public.app_user_presence p;
 return jsonb_build_object('registered',registered_count,'total',total_count,'online',online_count,'offline',total_count-online_count,
  'onlineWindowSeconds',120,'asOf',now(),'trackingStartedAt',(select tracking_started_at from public.app_presence_config where singleton));
end;$$;
revoke all on function public.omda_presence_stats() from public,anon;
grant execute on function public.omda_presence_stats() to authenticated;
commit;
