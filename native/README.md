# Zahin desktop and Android preview builds

These packages open the hosted application over HTTPS. They need internet. They do not include offline AI, a background OS-control agent, or new external integrations.

## Windows x64

Unzip the entire Windows archive into a folder, then open `AL OMDA Ai.exe`. Keep the other files alongside it. Unsigned preview, not an installer. No publisher certificate and no actual Windows acceptance test. A security warning may appear. Do not disable antivirus to run it.

## macOS

Choose `mac-arm64` for Apple Silicon or `mac-x64` for Intel. Unzip and move the app to Applications. Unsigned and not notarized. macOS may refuse to open it; do not disable Gatekeeper. The free Safari Add to Dock option is the safer fallback until a signed release is available. No actual macOS acceptance test.

## Android

The APK is a debug-signed preview for direct installation on Android8+. Allow installation only from the trusted file source, then turn that permission back off. Update Android System WebView. No actual Android acceptance test: the emulator could not start within the available hardware/CPU acceleration/memory. Microphone, camera, file picking and downloads require device acceptance. Page-owned blob downloads are limited to32MB in this wrapper; larger files should use the browser. No Play Store release claim.

The debug app ID is `ai.alomda.app.preview`, separate from a future release app. Debug signing is not a durable distribution identity. Keep a future release signing key in a secure vault; never commit it. Do not use this preview as an upgrade promise for an unrelated existing app.

## iPhone, free installable web app

Open the website in Safari, Share, Add to Home Screen, and choose Open as Web App if offered. This is a web app, not an IPA or App Store build. Existing account credentials stay the same. AI and sync still need internet.

## Reproduce

- Desktop: Node22, `cd native/desktop && npm ci && npm run dist`. macOS ZIP: `npx electron-builder --mac zip --x64 --arm64`. Windows/macOS signing is not configured.
- Android: JDK17, Android SDK35/build-tools35.0.0, Gradle8.11.1, `cd native/android && gradle assembleDebug`.
- Web: root `pnpm run build` and CI. Native packages load the current hosted web version.
