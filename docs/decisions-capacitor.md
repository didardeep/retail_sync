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
| C9 | The app is for AUDITORS ONLY, and the server enforces it. Chosen by the user. | A phone app for one job should not open the manager's screens, and hiding them is not security. Every request from the app carries `X-App-Client: auditor-app`; the server refuses any other role, at sign-in and on every later request (`backend/app/auth.py`). | Hide screens only: a manager's token would still work. Check only in the app: bypassable. |
| C10 | An expired login sends the person to the sign-in screen with a message; the same person then carries on where they were. Only the token is cleared, never the offline audits. | Found by testing: a login older than 12 hours made every request fail, but the app kept showing normal screens with no data and nothing opened. | Lengthen the token: not needed to fix this; the idle/expiry policy waits for KPMG's numbers (P6). Wipe data on expiry: would lose an auditor's unsynced audit. |
| C11 | Tap targets are 40 px or more on a phone (the old compact sizes return from the `md` breakpoint up); form fields have a 44 px minimum on a phone. | The pencil and view buttons were 22-26 px; the issues page had about 140 elements under 32 px. | A global rule for every button: breaks dense desktop layouts. |
| C12 | The AI assistant button is not shown in the Android app. | It floated over the bottom-right of every page and its full-screen panel sat under the status bar; auditors do not use it on the phone, and it is off without a key. | Fix its placement only: kept for the website (its panel now respects the status-bar space). |

## Switching to a hosted server later

1. Set `VITE_API_BASE=https://your-domain/api`.
2. Set `server.cleartext` to false (or delete it).
3. Restrict CORS in `backend/app/main.py` to `https://localhost` and the web domain.
4. Use Postgres and persistent storage for uploads.
5. `npm run apk:sync`, rebuild the APK.
