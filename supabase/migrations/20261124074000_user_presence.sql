begin;
-- No backfill from registrations: only an authenticated, visible app open counts.
create table if not exists public.app_user_presence (
 user_id uuid primary key references auth.users(id) on delete cascade,
 first_opened_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now()
);
create index if not exists app_user_presence_last_seen on public.app_user_presence(last_seen_at);
alter table public.app_user_presence enable row level security;
revoke all on public.app_user_presence from public,anon,authenticated;
create table if not exists public.app_presence_config (
 singleton boolean primary key default true check(singleton),
 tracking_started_at timestamptz not null default now()
);
insert into public.app_presence_config(singleton) values(true) on conflict do nothing;
alter table public.app_presence_config enable row level security;
revoke all on public.app_presence_config from public,anon,authenticated;
create or replace function public.omda_presence_heartbeat() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or exists(select 1 from public.app_account_controls where user_id=auth.uid() and suspended) then
  raise exception 'Sign in required' using errcode='42501';
 end if;
 insert into public.app_user_presence(user_id) values(auth.uid())
 on conflict(user_id) do update set last_seen_at=now()
 where public.app_user_presence.last_seen_at < now()-interval '45 seconds';
 return jsonb_build_object('recorded',true);
end;$$;
revoke all on function public.omda_presence_heartbeat() from public,anon;
grant execute on function public.omda_presence_heartbeat() to authenticated;
create or replace function public.omda_presence_stats() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare total_count bigint; online_count bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.app_admins where user_id=auth.uid()) or exists(select 1 from public.app_account_controls where user_id=auth.uid() and suspended) then
  raise exception 'Admin access denied' using errcode='42501';
 end if;
 select count(*),count(*) filter(where p.last_seen_at > now()-interval '120 seconds'
  and not exists(select 1 from public.app_account_controls c where c.user_id=p.user_id and c.suspended))
 into total_count,online_count from public.app_user_presence p;
 return jsonb_build_object('total',total_count,'online',online_count,'offline',total_count-online_count,
  'onlineWindowSeconds',120,'asOf',now(),'trackingStartedAt',(select tracking_started_at from public.app_presence_config where singleton));
end;$$;
revoke all on function public.omda_presence_stats() from public,anon;
grant execute on function public.omda_presence_stats() to authenticated;
commit;
