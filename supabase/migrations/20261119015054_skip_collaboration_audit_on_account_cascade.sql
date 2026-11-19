create or replace function omda_private.log_collaboration_record_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  if tg_op = 'DELETE' then
    target_user_id := old.user_id;
  else
    target_user_id := new.user_id;
  end if;

  -- Skip account-cascade deletes: the owning auth.users row is no longer visible,
  -- and its audit history is removed by the audit table's ON DELETE CASCADE.
  if not exists (select 1 from auth.users where id = target_user_id) then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

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
