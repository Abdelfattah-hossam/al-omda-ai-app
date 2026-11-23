# Known issues log

Found during Phase 4 work. Each entry: symptom, root cause, impact, proposed fix.

## 2026-11-22 — Project delete button freezes under native confirm dialog

- **Symptom:** clicking "حذف المشروع" (task history list) makes the page
  unresponsive in automated/headless browsers; the delete never completes.
- **Root cause:** `handleDeleteTask` (artifacts/al-omda-ai/src/App.tsx) uses
  the native `window.confirm()` modal. Native dialogs block the page's main
  thread until a human answers; in remote/automation contexts nobody can, so
  the tab wedges. The same pattern (`window.confirm`/`window.alert`) appears
  in other destructive/action flows.
- **Impact on real users:** low — a human on a phone/desktop answers the
  dialog normally. Impact on automation and embedding: high (full freeze).
- **Fix applied (2026-11-22):** the project delete button now opens an
  in-app RTL confirmation dialog (same overlay/dialog pattern as the global
  search modal); confirming runs the DELETE, cancelling closes it. The
  two-step confirm is kept. `window.alert` remains for error notices
  elsewhere (non-destructive, human-readable only); the stop-task and
  HTTPFlow-clear flows still use native confirm and are candidates for the
  same treatment later.
- **Found during:** Phase 4 slice 1 live verification cleanup, 2026-11-22.

## 2026-11-22 — iPhone: chat download opens inline viewer, file unreachable from task register

- **Symptom (reported live from an iPhone):** tapping تحميل on a chat
  artifact opened the document in Safari's inline viewer (its own تنزيل
  action did nothing, and the saved copy was named "Unknown.docx");
  tapping through to سجل المهام showed the artifact task's metadata but
  no way to preview or download the actual file.
- **Root cause:** (1) the iOS download branch used
  `window.open(blobUrl)` — iOS Safari cannot save blob: URLs and loses
  the filename; (2) the task detail page never listed the artifact asset
  that the chat fast-path saves under the task's storage folder.
- **Fix applied (2026-11-22):** shared download helper
  (src/lib/download-file.ts) routes iOS through the Web Share sheet with
  a real named File (Save to Files), anchor download elsewhere; the task
  detail page gained a "الملفات الناتجة" panel with inline preview +
  download; the chat card leads with in-app معاينة as the primary action.
- **Residual:** the iOS share-sheet path is verified by code/fallback
  only (cloud browser has no iOS engine); confirm once on a physical
  iPhone.

## 2026-11-22 — iPhone Files/Quick Look shrinks DOCX tables regardless of width markup

- **Symptom (reported live from an iPhone):** generated DOCX tables render
  narrow — every column squeezed to its text — in the iOS Files / Quick
  Look preview, even after the DOCX markup was fixed.
- **Root cause:** not the document. A five-variant experiment (pct widths,
  dxa widths, tblLayout fixed, cell margins, grid columns — all correct
  per OOXML) rendered identically narrow in the iOS viewer while opening
  correctly in desktop Word/LibreOffice. The iOS Files/Quick Look DOCX
  renderer ignores every table width technique and auto-fits to text.
- **Fix applied (2026-11-22):** PDF export (src/lib/table-pdf.ts,
  canvas → JPEG → PDF) with a "تحميل PDF" action on chat Word cards and
  per-.docx in the task register; PDF is the view-safe format on iPhone,
  DOCX stays for editing. Table visuals use the owner-approved "design B"
  (gold C9A24B header with dark rule, F6EDD2 first column) across chat
  docx, register docx and the PDF theme (commit 66e7c023).
- **Found during:** Phase 2 table-quality follow-up, 2026-11-22.

## 2026-11-22 — Supabase migrations: Management API route; target the private RPC, not the public wrapper

- **Context:** repo SQL under supabase/migrations is NOT applied by CI;
  nothing in .github/workflows touches the live database.
- **Historical method, not authorization:** live database administration was performed through the Supabase Management API. This note grants no permission for future access or changes. Owner approval must be established independently, and credential locations are intentionally omitted here.
- **Pitfall hit live (2026-11-22):** migration
  20261122142500_allow_concise_project_plans.sql targeted
  public.create_ai_task_with_quota, but since the Nov 17 hardening that
  public function is only a thin LANGUAGE sql wrapper delegating to
  omda_private.create_ai_task_with_quota, where the validation guards
  actually live. The migration's abort-on-unrecognized-guard fired
  correctly and nothing was changed by the committed file; the same
  guarded replace was then applied against omda_private.* and verified
  (guard now 1..8, grants and owner preserved). New migrations against
  hardened RPCs must introspect/target the omda_private function and
  keep the abort guard; always verify with a read-only definition check
  afterward.
- **Source correction verified (2026-11-22):** the committed migration and rollback now target `omda_private.create_ai_task_with_quota`. Their public-wrapper grants remain deliberate. The earlier replay warning is resolved in source; that is not a new claim about live database state.


## 2026-11-23: Home must explain the whole app

- User iPhone report: menu sections were not discoverable enough from home. The 23-item directory already existed but looked secondary under activity summaries.
- Changed home to show the app directory before performance summaries, with descriptions, search, six group jump buttons, and no hidden/collapsed section groups.
- Preserved all existing sections and added direct entries for Usage & Memory, advanced connections, and the existing image/video creation button. Total: 26 entries. Media links focus the existing projects-page launcher, not an invented service or a generation call.
- Desktop sidebar and mobile menu now use the same directory as home, preventing menu-only destinations. Deep links preserve explicit focus and open the advanced section automatically.
- Lavender/charcoal palette preserved. Chat markup, composer, scroll anchoring, task execution, and account data are unchanged. External integration presence is not described as a connected status.
- Validation: full typecheck/build; 22 focused tests; local browser layout at 320, 390, and 1280 widths; all 26 home/mobile-menu links equal; six groups; search and reset; finance visible; no horizontal overflow; advanced connection and media launcher deep links.
- Acceptance: Chrome emulation is not physical-iPhone acceptance. Live verification recorded separately after deployment.


## 2026-11-23: Huawei Browser blank chat body

- Real user screenshot from Huawei Nova, Huawei Browser, version unknown: app header visible, dark body, no composer.
- Reproduced the same appearance by removing CSS features unavailable in older engines: cascade layers, dynamic viewport units, and :has. Chat page collapsed to 1px; main area was 66px. This is a confirmed CSS compatibility failure mode, not a confirmed browser-version diagnosis.
- Added an unlayered baseline guarded by lack of dvh support. Uses vh and explicit flex ancestor heights, message overflow and a visible composer. Modern browsers keep the existing layered design untouched.
- Degraded-CSS browser checks at 360/390/412 widths: page fills viewport, messages visible, composer inside viewport, no horizontal overflow. Modern 320/390/1280 compact-turn/sides checks still pass; modern390 composer unchanged at [10,749,370,56].
- No chat messages sent, AI generations, account writes, or real tasks executed during testing. Physical Huawei acceptance remains open until the user reloads and tests on that device. JavaScript/CSS simulation is not an actual old-browser binary.


## 2026-11-23: Consistent centered card alignment

- Real iPhone screenshots showed centered icons but right-aligned titles/descriptions on home tiles. Explicit user request: put icon and text in the center together.
- All26 home directory tiles now use one center axis for icon, title and description, at every width. Group headings/subtitles centered too. Related specialist directory cards on home and Agent Network use the same centered icon/title/description layout; status sits below the icon rather than pulling it to one side.
- Palette, destinations, data and chat layout unchanged. Browser geometry checks measure icon/copy/title/description center within1.5px of each tile center at320/390/1280. Physical iPhone recheck remains open.


## 2026-11-23: Huawei runtime error, home chart API compatibility

- Second real Huawei Nova7i/Huawei Browser screenshot showed the React error fallback, route/version unknown. Do not call this confirmed chat failure.
- API-removal reproduction: without String.replaceAll, home renders the same error boundary. /ai, /agents and /profile rendered in that test. Home chart used replaceAll unconditionally. Replaced it with split/join, same chart output, no removed feature.
- Explicit build target chrome79/edge79/firefox78/safari13 lowers modern syntax; all built JS assets additionally parsed as ES2020. This does not polyfill every API or constitute a physical old-browser test.
- Error boundary now stores the last error name/message/build/path/browser/time locally and offers expandable production details for a screenshot. No error text, route, browser or account content is transmitted automatically. Existing console logging retained. Error fallback uses vh, not dvh.
- Checks: full build,16focused tests, missing newer APIs across home/chat/agents/profile, combined degraded-CSS layout, modern compact chat at320/390/1280 with390composer unchanged[10,749,370,56]. Forced invalid-date error verifies local diagnostics and expandable error UI.
- Physical Huawei acceptance remains open. If another error appears, expand details and capture the message/build/path to identify it rather than guessing.


## 2026-11-23: Confirmed Huawei /ai Object.hasOwn crash

- Physical-device error details finally identify TypeError Object.hasOwn is not a function, path /ai, build2946cfe3, Chromium88 desktop-mode UA. Earlier missing-API tests did not remove Object.hasOwn and missed this dependency requirement.
- React19/Vite7 app: react-markdown10.1.0 uses Object.hasOwn in three places in the shared markdown bundle. Sales analytics dependency has one guarded fallback use. No direct first-party Object.hasOwn call needed replacing. Audited every built JS asset, not server-only node_modules.
- First entry import now loads core-js3.49 stable API polyfills before app/dependency evaluation. Covers hasOwn, at/findLast, replaceAll, fromEntries, structuredClone and other standardized ES APIs through recent editions. Added guarded AbortSignal.timeout Web API fallback separately. Native APIs are not blindly overwritten. Third-party calls now work without patching node_modules.
- Explicit browserslist matches existing syntax target Chrome79/Edge79/Firefox78/Safari13/iOS13. Syntax lowering and runtime APIs are separate. core-js postinstall is not needed and is ignored, no build permissions broadened.
- Tests remove Object.hasOwn, fromEntries, at/findLast, replaceAll, structuredClone and AbortSignal.timeout before production startup. Home/chat/agents/profile render; markdown paragraphs visible; restored functions verified. Combined missing APIs + degraded CSS360/390/412 also pass. Modern chat320/390/1280 unchanged,390composer[10,749,370,56]. Full build/17focused tests;16built assets parse ES2020 including logical-assignment lowering. Not an actual Chromium88 binary or physical Huawei acceptance.
- Stable polyfill bundle adds about87KB gzip to main entry. This is a deliberate compatibility cost. Physical Huawei must reload and recheck, expanded error details remain available if a different API fails.


### Huawei history/project continuation follow-up

User reports the same error after opening an Angular interview project from history and continuing work. Did not open or execute that real project. Added old-browser-task.py: local synthetic history card, saved markdown result, simulated execute-step response, then rendered new markdown table, with hasOwn/fromEntries/at/findLast/replaceAll/structuredClone/timeout removed before startup and Chrome88 desktop-mode UA. Passed without error boundary. Same global polyfill covers TaskResultMarkdown's react-markdown dependency. No additional missing API found on this simulated path. Actual Huawei acceptance still pending reload of5ac2c157; a persistent error needs its new expanded details/build. No production task mutations or provider calls.


## 2026-11-23: Huawei performance after physical crash acceptance

- User confirms the app works on Huawei Nova7i, but scrolling and task creation feel slow. No physical profiling available.
- Local6xCPU-throttled production fixture: cold chat decoded JS1.150MB before to0.926MB after, about224KB/19.5% lower. Main gzip247KB to192KB. Single-pass script time0.65s to0.53s and heap5.9MB to5.1MB are simulated/noisy, not a claimed device speedup.
- Focused standard polyfill imports retain audited Chrome79/Safari13 runtime coverage rather than all315stable modules; old-API removal tests still pass. Voice/media tools lazy-load only when opened. Unchanged message markdown memoized to avoid reparsing old messages on each composer keystroke. Old-engine workspace decorative animations/blur/shadows disabled without changing palette or any scrolling/geometry handlers.
- Build/13focused tests; missing APIs and synthetic task continuation; modern320/390/1280composer/sides unchanged. Real generation/server waiting was not benchmarked and is not claimed faster. Physical scroll/creation acceptance still needed.


## 2026-11-23: Huawei final-project download fallback

- Physical Huawei screenshot reports the native download-manager request failed. Exact OS/browser cause cannot be confirmed through current Chrome simulation. Existing project button used a temporary blob URL (revoked after1.5s), a fragile handoff for old download managers.
- HuaweiBrowser and Chromium below94 now upload the generated task artifact first and request the existing authenticated same-origin HTTPS attachment endpoint. No new public access or storage destination. iPhone share-first flow and modern direct blob path unchanged. Upload failure remains visible instead of pretending a download happened.
- Attachment header includes an ASCII filename fallback alongside the UTF-8 filename for older managers. No auth policy changes.
-21focused tests passed, production build passed. Synthetic history fixture with Chrome88 UA and modern APIs removed confirms nonempty generated project upload followed by the private attachment GET. No real project or provider executed. Actual Huawei save acceptance is pending a physical retry.


## 2026-11-23: Final-project export format chooser

- User physically confirmed Huawei .md download by opening the file in Phoenix Files. Arabic glyphs in that viewer are unjoined/reordered. Screenshot indicates a text-shaping/bidi problem rather than UTF-8 mojibake. Actual downloaded bytes were not independently inspected. Source and synthetic roundtrip preserve logical UTF-8 Arabic.
- Final save/download button now opens PDF / Word DOCX / TXT / MD / HTML choices, without removing existing typed artifact downloads. Existing authenticated Huawei HTTP attachment path and iPhone native file sharing preserved. Asynchronous PDF on iOS prepares first, then offers a second real tap to save/share, retaining activation.
- Existing free canvas PDF and OOXML generators reused. PDF is image-based for stable Arabic shaping, not searchable/selectable. Word is editable text. TXT UTF-8 BOM improves encoding recognition but TXT/MD cannot repair an incapable viewer, stated in chooser. HTML is escaped static content, per-line dir=auto, UTF-8 charset and no-script/network CSP.
- Local synthetic Chrome88-UA browser fixture downloads all five nonempty files through upload+attachment. PDF pixels inspected with connected Arabic, Word inspected by LibreOffice render and OOXML UTF-8/bidi/font metadata, HTML inspected in browser.17format/download tests pass. These are actual generated files from a simulated task, not Huawei/iPhone acceptance. No real user project or provider executed.


## 2026-11-23 13:25 whole-app review fixes

- Medium: saved-asset and command-search downloads still reconstructed blob URLs on old Huawei, unlike the fixed final-project button. They now reuse the private attachment URL for old Chromium/Huawei, retaining modern/iOS named-Blob delivery. Local helper regression passes. Physical retry needed.
- Medium: PDF text blocks taller than a page were drawn off-page after one page break. Text is now split by available lines across pages. Local canvas regression asserts multi-page output with no text below the content boundary. Actual browser-generated Arabic long-request PDF has3pages; page2 pixels inspected with connected readable Arabic and intact margins. Oversized single table rows remain a separate limitation.
- Medium: pinned HTTP fallback stopped its attempt timer at TCP/TLS connection. A connected endpoint that never sent response headers could starve every later route. Timer now remains until headers arrive. Deterministic local connected-stall regression passes; original6tests now pass too. Full utility suite249pass/1skip before added regression; CI leaf suite354pass. No paid provider call or real task execution.
- Whole-app old-API simulation covers18actual routes; no error boundary. Linux Chrome with removed modern APIs and mobile viewport is not Windows/macOS/Safari/Android hardware acceptance. Live review read existing account data only: connections and usage200, contact/event/ticket list200, email page honestly unconnected. Configured providers are not confirmed healthy quota.


## 2026-11-23: Admin scope excluding conversations

- Owner selected two existing confirmed accounts and authorized administration of projects/work/settings/content/all users, explicitly excluding chat conversations. Membership keyed to auth UUID, no duplicate signups, invites or password changes.
- New protected admin RPC validates membership on every operation, audits reads/writes, paginates50rows, rejects stale project writes, and cannot edit message/memory tables or provider keys. Protected tables have no direct anon/authenticated grants. Existing chat/memory RLS policy metadata checked unchanged live.
- App user administration edits profile and suspends/restores API access; no account deletion, impersonation, password read/reset, role self-promotion, or infrastructure permissions. Suspended sessions fail central API access checks. Direct database RLS remains owner-scoped, not a promise of identity-provider-wide ban.
- Existing project request/result text may have originated in a conversation, but underlying messages and raw memory remain inaccessible to admins. No mutation fabricates project execution success.
- Three shared display settings only: announcement, help text, support email, rendered as escaped React text outside chat. Not arbitrary code/config/secrets.
- Live migration and rollback-only permission tests passed;25local focused tests/build passed. UI screenshots inspected at390/1280. Real physical device/admin-second-person acceptance not performed. Deployment verification tracked separately.
