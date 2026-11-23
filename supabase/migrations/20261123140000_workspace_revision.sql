begin;
-- O(1) per-account revision probes, instead of scanning project JSON or metadata.
create table if not exists public.workspace_revisions (
 user_id uuid primary key references auth.users(id) on delete cascade,
 revision uuid not null default gen_random_uuid()
);
alter table public.workspace_revisions enable row level security;
revoke all on public.workspace_revisions from anon,authenticated;
grant select on public.workspace_revisions to authenticated;
create policy workspace_revisions_read_own on public.workspace_revisions for select to authenticated using(user_id=(select auth.uid()));
create or replace function public.bump_workspace_revision() returns trigger language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 if tg_table_name='profiles' then
  if tg_op='DELETE' then owner_id:=old.id; else owner_id:=new.id; end if;
 else
  if tg_op='DELETE' then owner_id:=old.user_id; else owner_id:=new.user_id; end if;
 end if;
 -- auth-user cascades must not recreate a revision for a removed account.
 if exists(select 1 from auth.users where id=owner_id) then
  insert into public.workspace_revisions(user_id,revision) values(owner_id,gen_random_uuid()) on conflict(user_id) do update set revision=excluded.revision;
 end if;
 if tg_op='DELETE' then return old; else return new; end if;
end;$$;
revoke all on function public.bump_workspace_revision() from public,anon,authenticated;
create trigger tasks_workspace_revision after insert or update or delete on public.tasks for each row execute function public.bump_workspace_revision();
create trigger profiles_workspace_revision after insert or update or delete on public.profiles for each row execute function public.bump_workspace_revision();
create or replace function public.get_workspace_revision() returns text language sql stable security invoker set search_path='' as $$
 select coalesce((select revision::text from public.workspace_revisions where user_id=(select auth.uid())),'initial');
$$;
revoke all on function public.get_workspace_revision() from public,anon;
grant execute on function public.get_workspace_revision() to authenticated;
commit;
