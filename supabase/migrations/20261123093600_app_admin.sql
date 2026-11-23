begin;
create table if not exists public.app_admins(user_id uuid primary key references auth.users(id),created_at timestamptz not null default now());
create table if not exists public.app_account_controls(user_id uuid primary key references auth.users(id),suspended boolean not null default false,updated_at timestamptz not null default now());
create table if not exists public.app_admin_audit(id bigint generated always as identity primary key,actor_id uuid not null,action text not null,target_id text,details jsonb not null default '{}',created_at timestamptz not null default now());
create table if not exists public.app_shared_settings(key text primary key,value text not null default '',updated_at timestamptz not null default now());
alter table public.app_admins enable row level security;
alter table public.app_account_controls enable row level security;
alter table public.app_admin_audit enable row level security;
alter table public.app_shared_settings enable row level security;
revoke all on public.app_admins,public.app_account_controls,public.app_admin_audit,public.app_shared_settings from anon,authenticated;
create or replace function public.omda_account_access() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('admin',exists(select 1 from public.app_admins a where a.user_id=auth.uid()),'suspended',coalesce((select c.suspended from public.app_account_controls c where c.user_id=auth.uid()),false));
$$;
revoke all on function public.omda_account_access() from public,anon;
grant execute on function public.omda_account_access() to authenticated;
create or replace function public.omda_admin(p_action text,p_id text default null,p_data jsonb default '{}',p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; target uuid; count_rows integer;
begin
 if auth.uid() is null or not exists(select 1 from public.app_admins where user_id=auth.uid()) or exists(select 1 from public.app_account_controls where user_id=auth.uid() and suspended) then raise exception 'Admin access denied' using errcode='42501';end if;
 if p_offset<0 or p_offset>100000 then raise exception 'Invalid offset';end if;
 if p_action='users' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select u.id,u.email,u.created_at,p.display_name,p.organization,exists(select 1 from public.app_admins a where a.user_id=u.id) as admin,coalesce(c.suspended,false) as suspended from auth.users u left join public.profiles p on p.id=u.id left join public.app_account_controls c on c.user_id=u.id order by u.created_at desc,u.id limit 50 offset p_offset)x;
 elsif p_action='projects' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select t.id,t.user_id,t.title,t.request,t.specialty,t.status,t.created_at,t.updated_at,jsonb_array_length(t.steps) as step_count from public.tasks t order by t.created_at desc,t.id limit 50 offset p_offset)x;
 elsif p_action='project' then
  select to_jsonb(t) into result from public.tasks t where t.id=p_id::uuid;
 elsif p_action='audit' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select * from public.app_admin_audit order by id desc limit 50 offset p_offset)x;
 elsif p_action='settings' then
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (select * from public.app_shared_settings order by key)x;
 elsif p_action='update_user' then
  target:=p_id::uuid;
  if not exists(select 1 from auth.users where id=target) then raise exception 'User not found';end if;
  if p_data ? 'suspended' then
   if jsonb_typeof(p_data->'suspended')<>'boolean' then raise exception 'Invalid suspension';end if;
   if exists(select 1 from public.app_admins where user_id=target) then raise exception 'Admin accounts cannot be suspended here';end if;
   insert into public.app_account_controls(user_id,suspended)values(target,(p_data->>'suspended')::boolean) on conflict(user_id)do update set suspended=excluded.suspended,updated_at=now();
  end if;
  if p_data ? 'displayName' then
   if char_length(p_data->>'displayName')>160 then raise exception 'Name too long';end if;
   update public.profiles set display_name=p_data->>'displayName' where id=target;
  end if;
  if p_data ? 'organization' then
   if char_length(p_data->>'organization')>160 then raise exception 'Organization too long';end if;
   update public.profiles set organization=p_data->>'organization' where id=target;
  end if;
  result:=jsonb_build_object('saved',true);
 elsif p_action='update_project' then
  target:=p_id::uuid;
  if p_data->>'expectedUpdatedAt' is null then raise exception 'Current project revision required';end if;
  if not exists(select 1 from public.tasks where id=target and updated_at=(p_data->>'expectedUpdatedAt')::timestamptz) then raise exception 'Project changed. Reload before saving.' using errcode='40001';end if;
  if p_data ? 'title' and (char_length(p_data->>'title') not between 1 and 160) then raise exception 'Invalid title';end if;
  if p_data ? 'request' and (char_length(p_data->>'request') not between 1 and 10000) then raise exception 'Invalid request';end if;
  if p_data ? 'status' and p_data->>'status' not in('review','paused','stopped') then raise exception 'Admin cannot fabricate execution approval';end if;
  update public.tasks set title=coalesce(p_data->>'title',title),request=coalesce(p_data->>'request',request),status=coalesce(p_data->>'status',status) where id=target and updated_at=(p_data->>'expectedUpdatedAt')::timestamptz;
  get diagnostics count_rows=row_count;if count_rows<>1 then raise exception 'Project changed. Reload.' using errcode='40001';end if;
  result:=jsonb_build_object('saved',true);
 elsif p_action='update_setting' then
  if p_id not in('announcement','support_email','help_text') then raise exception 'Setting is not editable';end if;
  if jsonb_typeof(p_data->'value')<>'string' or char_length(p_data->>'value')>5000 then raise exception 'Invalid setting value';end if;
  insert into public.app_shared_settings(key,value)values(p_id,p_data->>'value')on conflict(key)do update set value=excluded.value,updated_at=now();result:=jsonb_build_object('saved',true);
 else raise exception 'Unsupported admin action';end if;
 insert into public.app_admin_audit(actor_id,action,target_id,details)values(auth.uid(),p_action,p_id,jsonb_build_object('offset',p_offset,'fields',(select coalesce(jsonb_agg(key),'[]')from jsonb_object_keys(p_data)key)));
 return result;
end;$$;
revoke all on function public.omda_admin(text,text,jsonb,integer) from public,anon;
grant execute on function public.omda_admin(text,text,jsonb,integer) to authenticated;
insert into public.app_admins(user_id)select id from auth.users where lower(email)in('abdelfattahhossam1@gmail.com','dev.mohamed98@gmail.com')on conflict do nothing;
commit;
-- Displayable shared content only. No provider credentials or private account data.
create or replace function public.omda_shared_content() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_object_agg(key,value),'{}') from public.app_shared_settings where key in('announcement','support_email','help_text');
$$;
revoke all on function public.omda_shared_content() from public;
grant execute on function public.omda_shared_content() to anon,authenticated;
