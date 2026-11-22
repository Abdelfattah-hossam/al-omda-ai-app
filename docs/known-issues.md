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
- **Authorized route:** Supabase Management API with the account-level
  Personal Access Token stored in the owner vault:
  POST https://api.supabase.com/v1/projects/rzznnrvlqumhymfmmpjk/database/query
  with {"query": "<sql>"}. Read-only checks (pg_get_functiondef, grants)
  go through the same endpoint.
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
- **Residual:** the committed 20261122142500 file (and its rollback)
  still names the public wrapper and will abort on replay — retarget it
  to omda_private.create_ai_task_with_quota.
