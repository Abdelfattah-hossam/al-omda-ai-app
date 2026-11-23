begin;
create table if not exists public.app_recovery_tickets(
 id uuid primary key default gen_random_uuid(),
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 issuer_id uuid not null references auth.users(id),
 target_id uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 consumed_at timestamptz,
 outcome text check(outcome in('replaced','started','completed','failed'))
);
create index if not exists app_recovery_issuer_created on public.app_recovery_tickets(issuer_id,created_at desc);
create index if not exists app_recovery_target_created on public.app_recovery_tickets(target_id,created_at desc);
alter table public.app_recovery_tickets enable row level security;
revoke all on public.app_recovery_tickets from public,anon,authenticated;
create or replace function public.omda_issue_recovery(p_target uuid,p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); ticket_id uuid; expiry timestamptz;
begin
 if actor is null or actor not in('47ee202d-244e-45a3-bbc9-cbc3cf1ae98c'::uuid,'4ecf4f2e-4ae5-4cdb-ace9-8ef9b1394096'::uuid)
 or not exists(select 1 from public.app_admins where user_id=actor)
 or exists(select 1 from public.app_account_controls where user_id=actor and suspended) then raise exception 'Recovery access denied' using errcode='42501';end if;
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid recovery ticket';end if;
 -- Stable lock order serializes actor limits and target replacement.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('recovery-issue',0));
 if not exists(select 1 from auth.users where id=p_target and email is not null and deleted_at is null)
 or exists(select 1 from public.app_admins where user_id=p_target)
 or exists(select 1 from public.app_account_controls where user_id=p_target and suspended) then raise exception 'Only active regular accounts can be recovered here' using errcode='42501';end if;
 if (select count(*) from public.app_recovery_tickets where issuer_id=actor and created_at>now()-interval '1 hour')>=10
 or exists(select 1 from public.app_recovery_tickets where target_id=p_target and created_at>now()-interval '1 minute') then raise exception 'Recovery rate limit. Wait before issuing another link.';end if;
 update public.app_recovery_tickets set consumed_at=now(),outcome='replaced' where target_id=p_target and consumed_at is null;
 insert into public.app_recovery_tickets(token_hash,issuer_id,target_id)values(p_hash,actor,p_target)returning id,expires_at into ticket_id,expiry;
 insert into public.app_admin_audit(actor_id,action,target_id,details)values(actor,'recovery_issued',p_target::text,jsonb_build_object('ticket_id',ticket_id,'expires_at',expiry));
 return jsonb_build_object('expiresAt',expiry);
end;$$;
revoke all on function public.omda_issue_recovery(uuid,text) from public,anon;
grant execute on function public.omda_issue_recovery(uuid,text) to authenticated;
create or replace function public.omda_consume_recovery(p_hash text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare ticket public.app_recovery_tickets; email_address text;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 select * into ticket from public.app_recovery_tickets where token_hash=p_hash for update;
 if not found or ticket.consumed_at is not null or ticket.expires_at<=now() then raise exception 'Invalid or expired recovery link';end if;
 if exists(select 1 from public.app_admins where user_id=ticket.target_id)
 or not exists(select 1 from public.app_admins where user_id=ticket.issuer_id)
 or exists(select 1 from public.app_account_controls where user_id in(ticket.target_id,ticket.issuer_id) and suspended) then raise exception 'Recovery no longer allowed';end if;
 select email into email_address from auth.users where id=ticket.target_id and deleted_at is null;
 if email_address is null then raise exception 'Account unavailable';end if;
 update public.app_recovery_tickets set consumed_at=now(),outcome='started' where id=ticket.id;
 insert into public.app_admin_audit(actor_id,action,target_id,details)values(ticket.issuer_id,'recovery_started',ticket.target_id::text,jsonb_build_object('ticket_id',ticket.id));
 return jsonb_build_object('ticketId',ticket.id,'targetId',ticket.target_id,'email',email_address);
end;$$;
revoke all on function public.omda_consume_recovery(text) from public,anon,authenticated;
grant execute on function public.omda_consume_recovery(text) to service_role;
create or replace function public.omda_finish_recovery(p_ticket uuid,p_success boolean) returns void
language plpgsql security definer set search_path='' as $$
declare ticket public.app_recovery_tickets;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Service only' using errcode='42501';end if;
 update public.app_recovery_tickets set outcome=case when p_success then 'completed' else 'failed' end where id=p_ticket and outcome='started' returning * into ticket;
 if found then insert into public.app_admin_audit(actor_id,action,target_id,details)values(ticket.issuer_id,case when p_success then 'recovery_completed' else 'recovery_failed' end,ticket.target_id::text,jsonb_build_object('ticket_id',ticket.id));end if;
end;$$;
revoke all on function public.omda_finish_recovery(uuid,boolean) from public,anon,authenticated;
grant execute on function public.omda_finish_recovery(uuid,boolean) to service_role;
commit;
