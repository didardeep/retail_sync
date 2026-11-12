# Decisions: Android app (Capacitor)

Full how-it-works and build guide: `docs/ANDROID_APP.md`.

Goal: an installable Android APK that wraps the existing React frontend and
talks to a backend server. First the server is the laptop; later a hosted one.

| # | Decision | Why | Alternatives rejected |
|---|----------|-----|-----------------------|
| C1 | Wrap the existing React app with Capacitor (`frontend/android/`). Chosen by the user. | One codebase. The offline queue, IndexedDB and service worker already work in a WebView. | Rewrite in React Native or Flutter: duplicates every screen. |
| C2 | The only thing that changes between laptop and hosted server is `VITE_API_BASE`, set at build time. | `client.js` already reads it. Inside the APK a relative `/api` would hit the phone itself, so it must be an absolute URL. | Runtime settings screen for the server address: more code, not needed yet. |
| C3 | Laptop server = laptop LAN IP over Wi-Fi, e.g. `http://192.168.1.26:5050/api`. | No hosting or tunnel needed. Backend already binds 0.0.0.0. | Tunnel: URL changes each run. Hosting: not ready yet. |
| C4 | `server.cleartext: true` and `android.allowMixedContent: true` in `capacitor.config.json`. | Android blocks plain HTTP by default, and the page is served as https://localhost so the WebView also blocks http calls from it (mixed content). The laptop server has no certificate. Found by testing: cleartext alone gave "You appear to be offline". | None for now. REMOVE BOTH when switching to an https server. |
| C5 | Evidence/photo links need no change. | `api.evidenceFile` sends through the same `BASE`. | n/a |
| C7 | Install Android Studio (not command-line tools only). | It bundles the SDK and Gradle setup. | Command-line SDK: more manual setup. |
| C8 | Build a DEBUG apk first. | Installs with no signing key. | Release build: do when publishing. |
| C6 | Test on the Android Studio emulator (AVD), then a real phone. BlueStacks also works but is a separate install. | The emulator ships with Android Studio. It reaches the laptop at `10.0.2.2`, which does not change when the Wi-Fi IP does. | BlueStacks: extra install; uses the laptop LAN IP like a phone. |

## Switching to a hosted server later

1. Set `VITE_API_BASE=https://your-domain/api`.
2. Set `server.cleartext` to false (or delete it).
3. Restrict CORS in `backend/app/main.py` to `https://localhost` and the web domain.
4. Use Postgres and persistent storage for uploads.
5. `npm run apk:sync`, rebuild the APK.
