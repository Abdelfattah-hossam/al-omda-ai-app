# Phase1a: bounded workspace pages and revision probes

Company use,1000+potential users, concurrent users unknown. No1000concurrent-user acceptance claim.

- GET/api/workspace is bounded to100projects, with nextOffset. Stable order:created_at desc,id desc. The frontend follows every page, so old projects stay reachable; this is not lazy detail loading yet.
- GET/api/workspace/revision reads one account-scoped token through RLS. Database triggers bump it on project insert/update/delete and profile changes. Unchanged polls no longer transfer all project requests,steps and generated results.
- Workspace background refresh has a single-flight guard. It retains its7second visible-tab cadence and account-scoped fallback cache. Chat code,scroll and layout are unchanged.
- On revision failure,the full workspace reload remains available. On a failed page,the client does not replace existing projects with a partial list.
- This reduces unchanged network payload; it does not reduce all polling/auth request counts or make the first historical load proportional only to visible projects. Summary/detail separation is still planned within phase1.

Verification:8new tests including250historical projects across3pages,duplicates,invalid cursor,error propagation,revision changes and overlap guard. Core268pass,1skip. Build/typecheck passed.19local browser route checks passed with synthetic backend.5navigation-scroll checks passed. Live database rollback checks confirmed project insert/update/delete and profile changes bump revision,RLS hides other accounts,anonymous RPC denied,and authenticated users cannot write revision records directly. No real project was executed. No physical iPhone test or load test.
