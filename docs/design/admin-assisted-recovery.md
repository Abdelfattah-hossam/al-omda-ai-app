# Admin-assisted account recovery

Authorized by user on2026-11-23: both existing admin accounts may issue links for regular users. Admin targets excluded.

Proposed flow:
- Only the two verified admin UUIDs can issue a ticket, enforced by the database.
- Admin opens Profile, administration, users, chooses an account, confirms its identity by an independent channel, then generates a single-use link valid for ten minutes. Admin never sees or chooses a password.
- The bearer ticket uses 256 bits of randomness, only a SHA-256 digest is stored. Do not include tickets in logs, audit details, analytics, screenshots or chat. Use a URL fragment so the bearer ticket is not part of HTTP navigation/referrer history. UI gives a copy button and explicit warning to share privately only with the verified account owner.
- GET does not consume tickets. Recipient opens the app, chooses a new password, then submits it through a same-origin POST which atomically consumes the ticket. Link previews cannot consume it.
- Audited issue and redemption events contain actor/target identifiers, no bearer ticket or password. Only one outstanding ticket per target; ten-minute expiry, stale tickets never reusable, locked accounts and owner recovery disallowed.
- Recipient chooses a new password privately in the app. Provider recovery session is created and used entirely inside the Edge Function, never returned to a browser. No full logged-in session is returned. Revoke sessions after change.
- A tightly scoped Supabase function may use the service-role environment to create the provider recovery session at redemption. Never place broad provider credentials in frontend or add infrastructure access to admins.
- Rate limits: bounded owner issuance per hour and redemption limits, cryptographic entropy, atomic single-use guards. Provider errors fail closed; spent tickets require new issuance.

Tests required before activation: owner vs second admin vs ordinary user vs anon; bad/expired/reused tickets; concurrent redemption; target suspension; issue cooldown; secret-free audit; provider failure; cookie and origin protections; mobile/desktop visual checks; no real account credential changes as tests. Keep existing email recovery and honest delivery limits.

Implemented server path: account-recovery Edge Function uses the service-provided administrative credential. The public API worker still has only its publishable key. No direct auth-table password updates.
