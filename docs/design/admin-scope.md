# Admin roles, proposed implementation boundary

Status: scope confirmed by owner. Both emails already exist as confirmed auth accounts. Membership provisioned by their existing UUIDs, without creating accounts, changing passwords, or sending duplicate invites. Backend/UI verification and deployment tracked separately.

## Scope

Two designated admin identities. Manage projects/work, application content/settings, and every existing user account. No access to user chat conversations. App administration does not grant GitHub, deployment, infrastructure, provider secrets, or operating-system access.

## Enforcement

- Maintain a protected membership table keyed by immutable auth user UUID, not client-editable profile metadata or email comparisons in the UI.
- Membership changes require a separate owner/bootstrap path, not ordinary users or admins promoting arbitrary accounts.
- Server verifies current session and membership on every admin operation. Deny by default and audit admin identity, target, action, and safe metadata.
- Keep chat/history/conversation/message and raw memory tables owner-only. Do not add global admin policies to all tables.
- Prefer bounded database RPCs for project/work administration with explicit validation and audit, not unrestricted generic SQL/REST proxy endpoints. Existing project state/approval constraints must still apply.
- Keep sensitive auth account operations behind the server, using approved infrastructure access only. Never expose service-role keys in browser responses or browser code.
- Do not grant account owners' passwords, login cookies, tokens, or reset links to admins. Use provider invitations and owner-directed recovery links.
- User management should cover account list/status, suspend/restore, and role display. Destructive deletion or account impersonation must not happen implicitly. Preserve existing data during rollout.
- Project data may include request/result excerpts originally supplied in a chat. That is not access to the underlying conversation. Do not join conversation tables or expose chat IDs/transcripts through project administration.

## Required tests

Anonymous and normal users denied; forged metadata denied; inactive admin denied; approved admin can list permitted work/accounts; all chat/history/attachment-memory paths remain owner-only; no secrets in responses; every mutation logged; pagination and stale-concurrent writes checked; account disabling cannot let queued work continue silently.

## Provisioning gap

Both requested identities were already confirmed accounts in the live identity provider. Their immutable IDs were verified before membership. No invitation/reset email is needed or sent. Forgot-password/invite callback UX remains a separate unimplemented capability. App access suspension is enforced centrally by the API; this is not an identity-provider-wide ban or a replacement for all direct RLS policies.
