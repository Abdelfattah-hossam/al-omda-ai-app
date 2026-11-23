-- Shared per-account abuse protection, independent of Worker isolate lifetime.
create table if not exists omda_private.ai_request_windows (
 user_id uuid primary key references auth.users(id) on delete cascade,
 minute_start timestamptz not null default now(), minute_count integer not null default 0,
 hour_start timestamptz not null default now(), hour_count integer not null default 0
);
alter table omda_private.ai_request_windows enable row level security;
revoke all on omda_private.ai_request_windows from public, anon, authenticated;
create or replace function public.omda_allow_ai_request() returns boolean
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); allowed boolean := false;
begin
 if caller is null then return false; end if;
 insert into omda_private.ai_request_windows(user_id) values(caller) on conflict do nothing;
 update omda_private.ai_request_windows set
 minute_count = case when minute_start <= now() - interval '1 minute' then 1 else minute_count + 1 end,
 minute_start = case when minute_start <= now() - interval '1 minute' then now() else minute_start end,
 hour_count = case when hour_start <= now() - interval '1 hour' then 1 else hour_count + 1 end,
 hour_start = case when hour_start <= now() - interval '1 hour' then now() else hour_start end
 where user_id = caller
 and (minute_start <= now() - interval '1 minute' or minute_count < 60)
 and (hour_start <= now() - interval '1 hour' or hour_count < 600)
 returning true into allowed;
 return coalesce(allowed, false);
end $$;
revoke all on function public.omda_allow_ai_request() from public, anon;
grant execute on function public.omda_allow_ai_request() to authenticated;
