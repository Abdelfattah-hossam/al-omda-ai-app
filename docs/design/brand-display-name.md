# Display-name update

Use the exact display name AL OMDA Ai throughout active UI, accessibility labels, metadata, install manifest, brand artwork, generated Office files and assistant self-identification. Keep Arabic surrounding copy. Preserve archived artwork and existing user records. Keep repo, URLs, storage keys, protocol markers, service identifiers and filesystem paths unchanged. No layout, chat scrolling or routing changes.

Tests: static branding inventory, Office export metadata, existing suite, typecheck/build, mobile and desktop browser images, production metadata and UI after deployment. External authentication email templates require a separate live configuration check. Existing installed names may need reinstall/OS refresh. Rollback: revert this commit, no data migration.

Production auth template check: default-provider/free-tier templates are unchanged. Supabase rejected SMTP sender configuration because custom SMTP is missing (401), and rejected template branding because default-provider free tier disallows it (400 entitlement_required). No paid upgrade or SMTP change made. Existing email body/subject remains provider default. No recovery email sent as a test.
