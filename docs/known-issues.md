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
- **Proposed fix (not yet applied):** replace `window.confirm`/`window.alert`
  with the app's own in-page confirmation dialog (consistent with the rest
  of the RTL UI, styleable, non-blocking for embedders). Deleting a project
  is a destructive action, so keep an explicit two-step confirm; do not
  remove the confirmation, only its native-modal implementation.
- **Found during:** Phase 4 slice 1 live verification cleanup, 2026-11-22.
