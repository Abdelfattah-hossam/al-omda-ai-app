# Asset pagination follow-up, 22 November 2026

Scope: preserve the existing 100-object response shape, accept a validated offset in the private storage listing API, and read all pages in Assets and global search. Do not change chat, schema, credentials, tenant checks, or write operations.

Risks: an abandoned folder read can continue unnecessarily, a later page can fail, or a malformed offset can reach storage. Keep the existing search concurrency of four, pass AbortSignal through reads, stop scheduling after close or folder change, and show errors rather than an incomplete Assets list. Offsets remain integers at least zero and within JavaScript's safe range. Folder listings are not a transaction, so concurrent uploads can shift offset pagination.

Tests: offset validation; 201 objects across three pages; an exact multiple requiring the empty final page; cancellation; later-page error; existing named-download and CSV tests; complete typecheck/build; local full-UI fixture with a match after file 100; live ordinary small-folder list and offset validation after deployment.

Rollback: revert this focused commit. No storage data or schema changes are required.
