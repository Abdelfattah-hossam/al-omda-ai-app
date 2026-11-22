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
