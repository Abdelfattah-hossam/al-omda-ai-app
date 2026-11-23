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

08:28 physical screenshots: waveform and 3% level establish some input activity on that iPhone, not owner recognition. Conditional mic-level row and shrinking flex body pushed notes under footer controls. Remove the duplicate state chip and obsolete conditional level row (the fixed diagnostic replaces it), reserve status and turn-control height, make all modal rows non-shrinking, and allow full modal scrolling. Compact orb to 140px wrapper on mobile. No acoustic logic changes.
Narrow-height follow-up: 320x700 acceptance exposed the legacy sticky end button floating over the test button. Restore normal flow for this modal footer only; scrolling now reveals the end control without overlapping any preceding content. Verified 390x844 and 320x700 stable idle/ready/armed positions and short-screen bottom reachability.

08:38 hands-free request: after one explicit live-session start, automatically calibrate/listen; after a valid response wait for all PCM or device-speech playback to finish before resetting the gate and resuming. Invalid short/noise turns rearm without admitting provider output. Keep sustained speech, speech band, 650ms silence, and manual finish. Scope is voice turn lifecycle only; no chat scroll/layout changes. Test synthetic two-turn input/PCM lifecycle plus noise/unsolicited content and manual finish. Rollback isolated commit. Physical iPhone acoustic success remains a device retest.
Hands-free acceptance: local synthetic 800Hz input with silence calibration opens two successive turns without any new-turn tap. First turn ends by silence, second by manual finish. Synthetic one-second PCM replies suppress all mic audio uplink while playing and resume listening automatically afterward; repeated the same path with device-speech fallback. Unsolicited provider content before valid speech never appears. Exactly two activityStart and two activityEnd events. Stop ends capture. Reserve a three-line diagnostic height to avoid growing frame-count wrapping moving the orb. This is synthetic browser coverage, not physical Safari acoustic verification.

08:42 follow-up broadens conversation style: understand informal/typo Arabic across dialects, mirror the speaker instead of forcing Egyptian, default Egyptian only when no stronger cue. Keep existing routing and structured schemas. Use one short clarifier for underspecified revisions/refusals and never invent execution. Voice test was device speechSynthesis only; now free /ai/speech is attempted first, then explicitly labelled device fallback with ar-EG/enhanced voice ranking. Existing Fish :free model is retained because current page lists $0; current speech model inventory omits it, so availability is not guaranteed and no paid model substitution is allowed. Natural voice quality is subjective and not accepted on iPhone yet.
Voice source references checked live: https://openrouter.ai/fish-audio/s2.1-pro-free:free lists $0; https://openrouter.ai/api/v1/audio/speech/models omits that exact free slug while listing paid Fish models, so keep strict :free only and no paid fallback. https://openrouter.ai/openapi.json confirms /audio/speech and instructions. https://docs.fish.audio/developer-guide/models-pricing/models-overview lists Arabic and natural language style control. These establish documented support, not that the configured free model can synthesize on this account. Tests use synthetic audio for the free endpoint and device speech separately, not provider quality acceptance.

## NEXUS SIGNATURE B identity, 23 Nov 2026
- Owner selected refined B after previews. Open asymmetric portal with two interior modules. Exact Latin name Al OMDA AI; Arabic العمدة.
- Replaced all active brand SVGs, outlined Latin wordmark, favicon, PNG app/apple/maskable icons and social image. Original files copied intact to public/brand/archive-before-nexus-20261123.
- Title, OG/Twitter, install manifest name/short_name and English interface labels use exact casing. Cache identity raised to v5-nexus; asset query version nexusB1.
- Free bounded similarity research found the broad three-part triangle family is common (Drive/Alchemy). B breaks the three-blade symmetry. No exclusivity or legal trademark clearance claimed.
- Full local CI command set run. All specialized suites pass. Base scripts suite224 pass/1 skip/1 network-deadline failure in pinned-http.test.ts, a pre-existing environment-dependent condition. Typecheck/build pass.
- Physical iOS home-screen icon refresh is not established by browser emulation. Existing installed shortcut may require re-add after new artwork deploys.

## Physical iPhone guest sheet and profile draft fixes
- Root causes: guest nudge z60 and bottom78 versus dock z80, height74, bottom7+safe-area. Signup merely routed to profile, appearing inert when already there. Nudge now z120 with93px+safe-area bottom,44px controls, scroll-constrained height and dedicated close row; signup dismisses and opens signup mode. No backdrop added.
- applyWorkspace refreshed profile fields every7sec and focus/visibility, erasing drafts. Per-field dirty refs and request revision guard preserve edits until explicit Save. In-flight save responses do not erase newer typing.
- Profile autocomplete nickname/organization and dark WebKit autofill styling. visualViewport keyboard sizing scoped to profile; dock hidden during keyboard, no chat scroll/composer changes. Safari keyboard accessory is browser UI, not an app toast.
- Local native touch/hit tests on390x844,320x568,375x667 across profile/home/agents/history/workbench/chat. All3nudge controls reachable, nav remains touchable, signup opens mode, auth field focuses. Drafts survive accelerated polling/focus at390/320; only explicit save writes synthetic API. Keyboard-resize branch checked with synthetic visualViewport signal, not physical iPhone proof.

## iPhone keyboard correction after physical regression
- Physical screenshot outranked prior synthetic check: setting fixed shell height to visualViewport.height left content clipped during Safari pan. Removed shell resize entirely.
- Profile-only keyboard mode keeps full app shell, computes keyboard inset using viewport height AND offsetTop, anchors Save/Upload above it, and scrolls focused field in the actual .main-area scroller. Route transition transform disabled only while profile keyboard is open so fixed actions stay viewport-relative.
- Tested300px simulated keyboard with0/120px viewport pan at390x844 and320x568. Focused field stays above Save/Upload, both44px+ actions receive touch; real touch Save sends one synthetic profile request. Drafts survive polling and focus. This is emulation, not physical Safari acceptance.

## Advanced connections audit and repair
- Original controls were wired to loopback Runtime endpoints, but unusable on iPhone without the separate computer service. Added clear boundary and distinct phone-ready hosted service panel.
- Hosted provider inventory is authenticated, secret-free and no-store. Selection persists only a provider ID per browser and applies to new chat messages. Auto keeps existing free fallback routing. Real generation test sends a fixed OK prompt, no user chat/files, uses one app unit only on success, and returns sanitized status. No external user keys accepted/stored.
- Local LM Studio/Ollama model Save/apply persists validated loopback-only endpoint/model under .omda/local-model.json, mode0600, keeps backup on revision, and is loaded for new runtime invocations. Remote endpoints, credentials, keys and query URLs rejected. Command execution permissions remain computer-side environment only.
- Browser policy already applied through Runtime save; failed saves now preserve the typed hostname. Desktop inspection, HTTP role compare/history and approval-gated local delegation remain real Runtime features, not cloud remote-control features.
- Lavender panels,44px actions, RTL, LTR endpoint inputs, responsive fields and wrapped status/model text. Checked320/390 widths. No chat layout or keyboard changes.

## Compact chat turns after physical iPhone screenshot
- Reproduced user's short Arabic exchange at390x844 before/after. Old user turn89.5px and assistant139.5px were caused by visible role labels, flex gap11px, large padding, framed action row.
- User bubble now44.25px for one line, assistant69.25px including40px accessible action targets. Assistant is flowing text with no enclosing card or divider. Role labels remain visually hidden for accessibility; message text, copy and listen actions retained.
- Lavender palette and charcoal canvas kept; buttons icon-only and transparent.320px wrapping inspected, desktop1280 inspected. Composer box unchanged at390:10,749,370,56. No scroll handler or composer changes. Physical Safari acceptance still not verified.

## Auto provider priority
- User requested ordering after all4real generation smoke tests succeeded. Text primary Groq, fallback OpenRouter, Gemini, Cloudflare. Images skip unsupported Cloudflare; long context leads OpenRouter to reduce low-TPM pressure on Groq.
- Measured smoke latency:Groq790ms,OpenRouter1078ms,Cloudflare601ms,Gemini16335ms. These are one short fixed-prompt sample each, not quality/dialect or sustained-load benchmarks. Kept Cloudflare small model last as conservative quality default, not a measured quality ranking.

## Explicit chat sides
- User requested physical left for their messages, right for AI. Physical auto margins enforce this in RTL and LTR. Compact44px user turns and unframed assistant text retained, no composer/scroll changes. Tested320/390/1280 geometry and RTL/LTR sides.


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
