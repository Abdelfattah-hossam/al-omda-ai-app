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

## Analytics reference dashboard

Sales Overview and Distribution now retain all CSV import/source/currency/table
controls and add reference-inspired dark glass summary tiles, colored badges,
smooth daily paid/refunded/pending lines, ranked channel progress bars and
percent pills, and paid/refund count bars. Product ranking and service level
are not available in the existing schema; the labels explicitly use actual
channels and transaction counts instead. Totals cover the imported period,
not an invented today total. Missing data uses dashes and empty cards. Payment
Gateways retains the not-connected notice with matching status tiles. No
revenue trend percentage is invented. Local checks: empty + synthetic CSV,
Arabic/English, 320/390/1280; 35 focused tests pass. Map CI and deploy succeeded.

## Second physical-iPhone bottom-edge report

A new real-device screenshot at 07:29 still showed an opaque home-indicator
strip while the new compact header was already loaded. viewport-fit=cover was
present; the remaining workspace clipping frame still depended on 100dvh and
root backgrounds were near-black. Replaced only the mobile non-chat workspace
frame with fixed inset:0 and percentage-height main-area, preserving its scroll
container and trailing safe-area padding. Root background is workspace ink on
non-chat routes. This targets Safari standalone viewport sizing but cannot be
confirmed on physical Safari here. Local workspace and unchanged chat geometry
checks passed. Do not mark physical-device acceptance complete.

## Speech-reactive voice reference

Chose the third supplied voice reference: a focused lavender/blue morphing orb,
waveform and centered microphone, which fits the app without crowding the chat.
The existing live voice transport, microphone gating, transcripts and controls
are retained. Added Web Audio analysers to the existing mic source and PCM
playback path, updating orb intensity and 28 frequency bars. Explicit idle,
connecting, listening, thinking and speaking states. Cleanup cancels animation
frames and disconnects analysers. Reduced-motion removes orb movement and uses
static-height level-opacity bars. Device speech-synthesis fallback cannot be
analysed through Web Audio, so it has a speaking label without fake waveform.
Local 320/390/1280 Arabic/English checks used fake mic + synthetic WebSocket/PCM,
not a real paid provider session. 38 focused tests + typecheck/build pass; chat
composer geometry is unchanged. Real-iPhone mic, audio routing and provider
acceptance remain unverified. No new paid service or credential introduced.

## Real iPhone voice correction

The user's physical Safari screenshot rejected the prior Chrome-only acceptance: the layered orb showed square compositing artifacts and the UI claimed to listen without audible speech being captured. Replaced the CSS conic/blend/rotated-glass orb with a native SVG gradient and ellipse strokes. Mobile voice dialog now fills its own backdrop to the screen edge, with safe-area padding, without altering the chat composer or transcript.

AudioContext construction and the first resume now happen synchronously in the original Start tap, before microphone permission and token fetch. A running context, live microphone track, and actual input processing callback are required before the provider token request. Output is explicitly silent on the capture graph. Permission, missing device, busy microphone, stopped tracks, and no detected speech have actionable messages. Listening is no longer claimed before speech is detected. Chrome synthetic microphone and PCM tests pass at 320/390/1280 in Arabic/English, as does denied-permission acceptance without provider connection. These are not physical-iOS audio verification. No real provider session was opened during this correction's tests.

## Composer follow-up from physical screenshots

Replaced the guessed -3px icon lift with flex centering of the existing controls and textarea. At 390x844 the composer remains x10/y749/w370/h87; all five control/text centers agree. No transcript scroll, send, or composer anchoring logic changed. Dictation uses native SpeechRecognition/webkitSpeechRecognition, not MediaRecorder: no WebM codec is involved. It now waits for onstart before claiming to record, has a startup timeout, filters interim duplicates, shows a local error/keyboard-dictation fallback, and explains Safari aborted events instead of a generic stopped notice. The user's screenshot establishes an aborted event, not why Safari aborted it. Painted html/body/root under the chat with its existing #0b0b0b background to avoid the contrasting home-indicator band. Physical iPhone verification remains required.

## Profile account center and remaining gold sweep

Split the merged account/profile form into separate cards, with a personal summary and section navigation, a two-column desktop layout and single-column mobile layout. Kept name/organization saving, private avatar upload, sign in/sign up/sign out, language and reduced motion. Added daily usage from the existing account API with validation, loading/error/guest states and refresh; it is explicitly units, not money. Added workspace source status without claiming device-session monitoring, project CSV export excluding demo tasks, a files/deliverables link, and export-scope clarification. Personal counters exclude demo tasks. No fake credits or device records were added.

Converted remaining decorative legacy gold colors to violet while preserving lightness, including the media-studio portal, document previews/print headings, offline notice, code header, older directory CSS and error screen. Left logo SVG unchanged, kept the existing optional Amber swatch and semantic transaction chart colors. This is a color-only source sweep outside the profile layout. Physical iPhone voice acceptance is still separate and pending. Local fixture acceptance covered guest/signed-in profile and seven surrounding routes, Arabic/English at 320/390/1280, without sending account mutations or real provider requests.

## iPhone silent microphone follow-up

Physical evidence confirms SVG rendering works but the microphone supplied no detected speech. Removed forced echo/noise/gain constraints and use the device's default audio capture. Where supported, request the play-and-record audio session route; resume the unlocked context again after permission. Connect the analyser to the rendered graph through a zero-gain sink for WebKit. Lower the client speech gate from .012 to .0015 so quiet input is not wholly discarded. Track processed frames, peak RMS, muted tracks and context state; the UI reports silent frames versus a quiet or muted microphone instead of guessing that permission is denied. Native iOS retest is still needed, and no real provider session was started in acceptance. Added explicit lavender provider-menu icons/dots after physical screenshot feedback. The gold-only studio regression assertion was updated to the intentionally requested lavender palette.

## Unrequested transcript safeguard

A physical screenshot showed a user-attributed English phrase the user says he never spoke. The screenshot cannot establish the exact initiating gesture. Source review shows opening the chat and native dictation do not auto-send text, while live-session transcripts were automatically stored. The previous low fixed speech threshold could pass background noise. Replaced it with a 600ms calibrated noise floor, 3.2x floor threshold with .004 minimum, sustained 250ms onset and at least350ms voiced input before accepting a transcript. Each turn now also requires an explicit New speaking turn tap, separate from connecting the microphone. Unsolicited provider content is dropped unless the client has a valid completed voice turn. Added Arabic/English transcription hint and instructions not to infer words from noise. Tests cover steady noise/silence, clicks, sustained voice and unsolicited provider transcription without a valid turn. No user chat messages were deleted. This intentionally changes voice interaction for safety; physical iPhone acceptance remains outstanding.

## Profile physical screenshot corrections

Live account read confirms 45 tasks,31approved,14review/paused and zero demo tasks. The remote profile display name is empty, not a saved name lost by the input. Show Complete your profile/No display name yet and an explicit hint rather than a generic name that implies a stored value. Open privacy content by default, align its disclosure arrow using flex instead of negative-margin float, and remove the floating chat launcher from this page only; a visible in-flow Open AI chat link keeps access. Profile-specific end padding allows the final privacy card to scroll fully above the fixed dock. Synthetic acceptance checks at320/390 verify its bottom is above nav at end of scroll, plus no floating launcher. Logo untouched.

## Safari icon ghost surfaces

Removed SVG itself from the active navigation background selector, which was painting a tile and inset shadow on the glyph. Cleaned backgrounds, shadows, filters and backdrop filters on profile SVG and shared icon-wrapper glyphs, plus the disclosure chevron. Active navigation remains visibly selected on the link, not behind the SVG. No dock geometry or bottom-area changes. Local profile screenshots inspected and19focused tests/typecheck/build passed; physical Safari confirmation remains needed.

## Room-sound reduction, not speaker identification

Request echo/noise reduction, mono capture and no automatic gain boost using ideal constraints; only unsupported-constraint errors fall back to default capture. Raise calibrated gate to4xambient with .006 minimum and300ms sustained onset; require35% of spectral energy in250–3600Hz to reject rumble/hiss. End a speaking turn after650ms silence, and provide Finish speaking turn now. Level reports current input rather than historical peak. Clearly state that this cannot distinguish the owner's voice from other people speaking; a nearby/headset mic is the practical isolation route. Unit tests verify noise, clicks, speech bands and onset, plus synthetic unsolicited-transcript rejection. Not physical iPhone acoustic acceptance.

### 08:24 alignment correction
The user's physical screenshot shows the preferences disclosure centered near y540 and the settings glyph near y575 at 728px image width, about 35px apart. The request is alignment, not removal of lavender boxes. Scope: restore icon surfaces on real wrappers; use a shared 40px icon/disclosure grid with 10px gaps and a reserved disclosure column on plain headings; normalize the monitor row to the same columns. Bottom navigation gets equal 28px wrapper slots and no active vertical offset. Keep existing palette/type/card design and dock outer geometry. Risks: narrow bilingual headings and legacy important-layer rules. Tests: focused source assertions, 320/390/1280 bilingual guest/signed-in screenshots and bounding-box assertions, build/typecheck, then live deployment verification. Rollback is this isolated commit. No account/task/provider writes.

Voice follow-up: network/current cloud-browser asset manifest points to AIChat-DN4Ab-2d.js, containing the current manual-turn/noise-suppression constraints. Its active worker cache is al-omda-shell-v4-b89ee8ba4353f074. This establishes server and cloud Chrome state, not the iPhone's loaded tab. HTML navigations are network-first and each build changes the worker cache namespace; an already-open app does not swap its running JS automatically. Add a visible Git build ID with ready/armed/connecting state and 500ms input frames/RMS/AudioContext/track diagnostic. Count raw frames before provider-readiness suppression so silence and provider state are distinguishable. No gate thresholds or capture constraints changed.
