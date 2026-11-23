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

## Chat accent unification follow-up

The owner asked at 07:17 Dubai to unify remaining gold chat accents with the
new workspace palette. A color-only chat layer now covers file preview/download,
secondary artifact actions, response copy/audio actions, preview labels/code,
active send controls and the body-level media studio. Charcoal #0b0b0b remains.
No chat layout, composer or scroll handlers changed. Existing semantic success,
error and tool-category colors remain. No file content is recolored or rewritten.
22 focused tests pass and the full typecheck/build passes. Synthetic-account
Chrome renders at 320/390/1280 confirm lavender artifact buttons, working local
preview and no page overflow. Screenshots inspected at mobile and desktop sizes.
No paid services or real AI execution were used for this change.

## iPhone workspace geometry follow-up

Owner screenshot at 07:20 Dubai showed a three-row crowded header and a large
empty strip above the floating dock. Root cause: mobile header overrides forced
six actions and metrics into separate rows, while main-area height subtracted
158px plus the bottom safe area. The workspace now uses a compact metrics row
and an accessible actions disclosure, retaining all six controls. The main-area
fills the viewport behind the dock; end padding keeps the last content reachable.
No overflow mode, scroll handler or chat rule changed. Local checks cover 320,
390, 1280, menu open/help/close and scrolling to last content. Physical iPhone
acceptance remains pending; the supplied screenshot is the bug evidence.

## Typing-bar icon follow-up

Raised only image/plus/mic/headphones SVG glyphs by 3px below 768px. Button hit
areas, composer placement, keyboard and scrolling code are unchanged. Local
checks at 320/390/1280 confirm all four glyph translations, desktop unaffected,
charcoal preserved and file preview working. At 390x844, composer remains
x10/y749/w370/h87. Requires physical-iPhone acceptance.

## Interactive country map

Added to Sales Distribution, matching the reference's dark map/glass card with
colored countries only when imported transactions supply a country. No country
is inferred from currency. Old CSVs still work; optional country/country_code/
billing_country/shipping_country fields accept geometry dataset codes/names.
Pending/cancelled excluded, refunds subtract, unknown countries stay unassigned.
176 bundled Natural Earth country/area shapes; no paid services or runtime tiles.
Country picker, tap, hover/focus, arrow keyboard navigation, zoom and drag pan.
No data shows a clear empty state, not zero-sales claims. Local Arabic/English
320/390/1280 checks passed with 33 focused tests; physical-device acceptance pending.
