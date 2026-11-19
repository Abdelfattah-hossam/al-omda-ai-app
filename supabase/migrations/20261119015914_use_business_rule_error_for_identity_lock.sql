-- Final migration for the immutable identity rule: P0001 denotes a business-rule rejection.
create or replace function omda_private.prevent_collaboration_record_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.kind is distinct from old.kind then
    raise exception 'Collaboration record owner and kind are immutable' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function omda_private.prevent_collaboration_record_identity_change() from public, anon, authenticated;
