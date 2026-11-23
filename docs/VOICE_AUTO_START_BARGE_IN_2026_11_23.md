# Voice auto-start and barge-in

User requests:opening live voice should start the call without a second microphone button;remove the manual end-turn button and debug panel;keep end-call;reduce noise and allow the user to interrupt a spoken reply.

The opening tap now creates/resumes the audio context before the lazy voice component loads. That component starts capture and connects automatically,after permission. Safari's permission prompt cannot be bypassed. A denied/missing/busy microphone or interrupted audio route shows an actionable error and a text Retry button. No automatic retry loop is used. Backgrounding the page closes the capture and socket;closing the modal or end-call does the same. Noise suppression,echo cancellation,mono capture and disabled automatic gain remain requested.

During playback,the microphone is analysed locally. Sustained speech-like residual input must last300ms and exceed the calibrated noise floor,an absolute minimum,and a playback-relative threshold. Short noise spikes do not trigger barge-in. On detection,the client immediately stops all current/queued PCM sources or fallback speech,cancels pending fallback fetches,discards the prior response,and signals activityStart to interrupt server generation. A half-second pre-roll keeps the beginning of the new speech.650ms of silence finishes that user turn automatically. Unsolicited/stale output is ignored until a valid input turn. No hidden half-duplex fallback disables the requested interruption feature.

Limits:browser echo cancellation is best-effort,not speaker identification or complete noise isolation. Real iPhone speaker echo has not been retested. A headset is advised if residual echo causes self-interruption;very quiet/distant interruptions may not cross the conservative threshold. The app makes no speaker-isolation guarantee. The built-in speech fallback has less playback-level measurement than PCM,so real-device echo matters especially there.

Verification:276tests pass,1skip;build/typecheck pass. Synthetic browser capture/provider tests verified automatic call start,two successive turns,short-noise rejection,sustained speech interruption during fallback speech,interruption of actual queued PCM playback,automatic silence completion,permission denial without provider connection,explicit retry,background cleanup,and end-call cleanup.390px screenshots visually inspected. Five page-scroll regression checks passed;chat scrolling code and CSS were not edited. The only AIChat changes are voice opening/context ownership and the voice component prop.

Provider semantics checked against:
https://ai.google.dev/api/live?authuser=1
https://aistudio.google.com/docs/live-api/capabilities
