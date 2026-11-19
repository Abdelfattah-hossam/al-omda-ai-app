create schema if not exists omda_private;

create or replace function omda_private.log_collaboration_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  target_kind text;
  target_record_id uuid;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
    target_kind := old.kind;
    target_record_id := old.id;
  elsif tg_op = 'UPDATE' then
    target_user_id := old.user_id;
    target_kind := old.kind;
    target_record_id := old.id;
  else
    target_user_id := new.user_id;
    target_kind := new.kind;
    target_record_id := new.id;
  end if;

  if not exists (select 1 from auth.users where id = target_user_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  insert into public.collaboration_audit_events (user_id, action, record_kind, record_id)
  values (
    target_user_id,
    case when tg_op = 'INSERT' then 'created' when tg_op = 'UPDATE' then 'updated' else 'deleted' end,
    target_kind,
    target_record_id
  );

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function omda_private.log_collaboration_record_change() from public, anon, authenticated;

create or replace function omda_private.prevent_collaboration_record_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.kind is distinct from old.kind then
    raise exception 'Collaboration record owner and kind are immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function omda_private.prevent_collaboration_record_identity_change() from public, anon, authenticated;

drop trigger if exists collaboration_records_identity_immutable on public.collaboration_records;
create trigger collaboration_records_identity_immutable
  before update of user_id, kind on public.collaboration_records
  for each row execute function omda_private.prevent_collaboration_record_identity_change();
