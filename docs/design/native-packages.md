# Native package plan

Deliver wrappers of the hosted AL OMDA Ai application, not a separate offline AI or operating-system control service. Website updates continue to appear in both apps.

Windows: Electron ZIP, x64, no installer or paid certificate. Context isolation, sandbox, no Node in remote content, navigation limited to the exact application origin, external HTTPS links open in the system browser. No preload or native bridge. Downloads use the normal save dialog. Permissions limited to app-origin microphone/camera when requested. Windows signing/SmartScreen trust and actual Windows acceptance remain unverified.

Android: native WebView APK for sideload testing. HTTPS app origin only internally, external HTTPS opens the browser. No JavaScript native bridge or file URL access, no cleartext traffic. Explicit runtime microphone/camera permission; file selection and downloads use platform controls. Must inspect native behavior on emulator if available, otherwise label unverified. Debug signing is for direct testing, not Play distribution; updates require matching signing certificate.

Validation: existing CI, all tests plus native security checks, build artifacts and hashes, package metadata, UI screenshots. Full acceptance report separates local/provider-mocked/live/physical checks. Existing disconnected integrations are limitations, not successful integrations. No real task execution or real password changes for tests.

Rollback: native packages are additive; no schema changes or chat scrolling changes.
