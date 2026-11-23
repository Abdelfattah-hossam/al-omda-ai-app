# Password recovery reliability

Confirmed production blocker: Supabase default email provider, no custom SMTP, two emails/hour. Default-provider delivery is restricted to project-team addresses. Correct site/callback URLs alone do not fix delivery. Do not claim delivery succeeded.

Scope: validate recovery access against Auth, expire invalid cookies, show recovery-specific delivery errors without false success, and add a password change route for already signed-in users who know the current password. Verify the current password against Auth before changing it. Never expose passwords in logs, response bodies or admin tools. Revoke sessions and clear local session cookies after password changes. Keep existing PKCE recovery and same-browser requirements. No new admin recovery powers without owner confirmation.

Tests: valid/expired provider sessions, missing cookies, no-origin rejection, password validation, wrong-current-password refusal, update and revocation. Browser fixtures use synthetic data; no real password resets or email sends. Build/typecheck and CI. Rollback by reverting commit; no data migrations.
