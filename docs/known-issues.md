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
