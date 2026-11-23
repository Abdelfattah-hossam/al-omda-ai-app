# Agent dashboard reference pass, 2026-11-23

## Scope

Adapt the structure of the eleven supplied reference images to AL OMDA's existing dark/gold interface. Preserve the charcoal chat, chat scrolling, existing routes, runtime controls, and all ten specialty templates. No payment, new provider, account setup, or protected-project execution.

## Implemented

- Search by specialty name or description, specialty selector, activity filters, result count, and clear-filter empty state.
- Cards show saved-task counts and review/paused counts, excluding demo tasks.
- The progress bar measures approved plan steps, not agent success or completed execution. A no-step denominator displays a dash, not a fabricated percentage.
- Expandable details show up to five latest saved tasks with dates, plan statuses, and existing project links.
- Existing Use agent action still selects its specialty in the workbench.
- Dashboard adds four specialties ordered by saved-task volume, with direct directory links.
- Removed the incorrect fixed /06 numbering. These are ten templates, not independently running agents.
- Existing runtime, setup guides, and all other functions remain available.

## Local verification

- Full typecheck and production build passed.
- Nineteen focused tests passed, comprising six activity tests and thirteen existing mobile regressions.
- Headless Chrome at 1280x1000, 390x844, 320x760: search, all activity filters, empty state/reset, detail expansion, actual selected workbench specialty, saved-task navigation, and dashboard overview.
- Direct specialty URL and English/LTR switch checked.
- All tested widths contained horizontally. Screenshots visually inspected after palette correction. These are local synthetic fixtures and viewport emulation, not physical iPhone/Android acceptance.
- Full existing script suite: 193 passed, one failed, one skipped (195 tests including nested tests). The existing pinned-http test for a deliberately stalled 203.0.113.1 route exceeded its three-second deadline. It also failed in isolation. No network implementation/test changed in this design pass. Do not report the full suite as green based on the focused tests.

## Not claimed

No independent live-agent running state, success rate, spending, new agent builder, working service connection, new voice capability, or real-device acceptance is inferred from the reference pictures. Those controls are not fabricated for appearance.


## Authorized palette follow-up

The owner explicitly allowed changing colors at 06:20 Dubai, November 23.
The dark purple reference is now the non-chat workspace palette:
- Ink canvas #12101c, purple-gray cards #302b41 to #211f2c.
- Lavender #b79aef, pale lavender #e0d2ff, cool white #f1eff9.
- Muted labels #b9b3ca; success remains green and errors remain rose/red.
- The existing brand logo remains its original image.

Implementation is a color-only important cascade layer, scoped to
`.app-shell:not([data-chat-active="true"])`. It changes no layout dimensions,
scroll rules, handlers or chat CSS. Both /ai and /ai/usage retain chat scope.
21 focused tests pass, including palette scope and color-only regression tests.
Typecheck and build pass. Synthetic-account Chrome checks cover 320, 390 and
1280 widths, Arabic and English, directory interactions and navigation.
Home, workbench, profile and charcoal chat were rendered at 390 and 1280.
Screenshots were inspected and a first-pass leftover gold surface corrected.
This is browser emulation, not physical iPhone/Android acceptance.
The previous broad-suite network-timeout caveat still applies.
