create table if not exists public.collaboration_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('created', 'updated', 'deleted')),
  record_kind text not null check (record_kind in ('contact', 'event', 'ticket')),
  record_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists collaboration_audit_events_user_created_idx
  on public.collaboration_audit_events (user_id, created_at desc);

alter table public.collaboration_audit_events enable row level security;
revoke all on table public.collaboration_audit_events from public, anon, authenticated;
grant select on table public.collaboration_audit_events to authenticated;

create policy "Users can read their own collaboration audit events"
  on public.collaboration_audit_events for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function omda_private.log_collaboration_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    insert into public.collaboration_audit_events (user_id, action, record_kind, record_id)
    values (old.user_id, 'deleted', old.kind, old.id);
    return old;
  end if;

  insert into public.collaboration_audit_events (user_id, action, record_kind, record_id)
  values (new.user_id, case when tg_op = 'INSERT' then 'created' else 'updated' end, new.kind, new.id);
  return new;
end;
$$;

revoke all on function omda_private.log_collaboration_record_change() from public, anon, authenticated;

drop trigger if exists collaboration_records_audit_trigger on public.collaboration_records;
create trigger collaboration_records_audit_trigger
  after insert or update or delete on public.collaboration_records
  for each row execute function omda_private.log_collaboration_record_change();
