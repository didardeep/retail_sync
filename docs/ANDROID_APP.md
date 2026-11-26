# Android app (Capacitor) -- how it works and how to build it

Written for someone with no history on this project. The short decision table
is in `docs/decisions-capacitor.md`; this file explains the whole thing.

---

## 1. What the Android app is

The Android app is NOT a second app. It is the existing React frontend
(`frontend/`) packaged inside a thin Android shell. The shell is made by
Capacitor. Inside the shell is a WebView (a built-in browser with no address
bar) that opens the built web files from the phone's own storage.

```
 Phone / BlueStacks                          Server (laptop now, hosted later)
+-------------------------------+           +--------------------------------+
| Android shell (Capacitor)     |           | FastAPI backend  (port 5050)   |
|  +-------------------------+  |   HTTP    |   + database (SQLite/Postgres) |
|  | WebView                 |  | --------> |   + uploads folder             |
|  |  React app (frontend/)  |  |  /api/... |                                |
|  |  IndexedDB (offline)    |  | <-------- |                                |
|  +-------------------------+  |   JSON    |                                |
+-------------------------------+           +--------------------------------+
```

Key consequences:
- All screens and logic are the same React code as the website. Fix a bug or
  add a screen in `frontend/src/` and it appears in the app after a rebuild.
- The server is a separate thing. The app holds no business data except the
  offline copy of audits not yet synced (IndexedDB). Everything else is fetched
  from the server.
- The app needs the server's address. That address is the ONLY thing that
  differs between "demo on the laptop" and "production on a hosted server".

---

## 2. Where the server address lives (the one thing to change)

`frontend/src/api/client.js`, line 1:

```js
const BASE = import.meta.env.VITE_API_BASE || '/api'
```

- On the website (dev server or `npm run pwa`), `VITE_API_BASE` is unset, so
  calls go to the relative path `/api`. Vite proxies that to the backend
  (`frontend/vite.config.js`).
- Inside the APK there is no web server to proxy anything, and a relative
  `/api` would point at the phone itself. So the APK must be built with an
  ABSOLUTE address, for example `http://192.168.1.26:5050/api`.
- Vite copies the value into the JavaScript at BUILD time. Changing it means
  rebuilding the app (`npm run apk:sync`) and reinstalling the APK. It is not a
  setting the user can change inside the app.

Photo/evidence files need no extra handling: `api.evidenceFile` in `client.js`
goes through the same `BASE`.

| Stage | VITE_API_BASE | HTTP or HTTPS |
|-------|---------------|---------------|
| Demo, server on laptop | `http://<laptop-wifi-ip>:5050/api` | HTTP |
| Production, hosted | `https://<your-domain>/api` | HTTPS |

---

## 3. Files that matter

| File / folder | What it is | Edit by hand? |
|---------------|------------|---------------|
| `frontend/capacitor.config.json` | App id, app name, web folder, cleartext (plain HTTP) switch | Yes |
| `frontend/android/` | The generated Android Studio project | Rarely (icons, permissions) |
| `frontend/android/app/src/main/AndroidManifest.xml` | Android permissions (camera etc.) | When adding permissions |
| `frontend/package.json` scripts | `apk:sync`, `apk:open` | Rarely |
| `frontend/.env.apk.example` | Example of the server address to build with | Copy and edit |
| `frontend/src/api/client.js` | Reads `VITE_API_BASE`; marks every app request; announces an expired login | No |
| `frontend/src/lib/appClient.js` | Detects the Android app, builds the `X-App-Client` header, says which roles may stay signed in | No |
| `frontend/src/lib/sessionExpiry.js` | The expired-login event and the resume rule | No |
| `frontend/src/App.jsx` | Listens for the expiry, drops a leftover non-auditor login, lands on the right page after sign-in | No |
| `backend/app/auth.py` | The auditor-only check (`blocked_in_auditor_app`) | No |
| `backend/app/main.py` | CORS settings (line ~30) | At production time |
| `backend/run.py` | Starts the server on all interfaces (0.0.0.0:5050) | No |

`frontend/android/app/src/main/assets/public/` is a COPY of the built web app,
refreshed by `npm run apk:sync`. Never edit files there; they are overwritten.

---

## 4. Decisions and why

(Same IDs as `docs/decisions-capacitor.md`.)

| # | Decision | Why | Alternatives rejected |
|---|----------|-----|-----------------------|
| C1 | Wrap the existing React app with Capacitor. Chosen by the user. | One codebase. The offline queue, IndexedDB and service worker already work inside a WebView. | React Native / Flutter: would mean rewriting every screen. |
| C2 | Only `VITE_API_BASE` differs between laptop and hosted server. | `client.js` already reads it. Moving to production is a rebuild, not a rewrite. | A settings screen to type the server address: extra code, not needed yet. |
| C3 | Demo server = the laptop, reached over Wi-Fi by its LAN IP. | No hosting or tunnel needed. The backend already listens on 0.0.0.0. | Tunnel (ngrok etc.): URL changes each run. Hosting: not ready yet. |
| C4 | `server.cleartext: true` AND `android.allowMixedContent: true` in `capacitor.config.json`. | Two separate blocks: Android refuses plain HTTP by default (cleartext), and the app page is served as `https://localhost`, so the WebView also refuses to call an `http://` server from it (mixed content). With only the first flag the app showed "You appear to be offline" at login even though the server was reachable. The laptop has no certificate. | None for the demo. BOTH MUST be removed for production (section 8). |
| C5 | No change to evidence/photo URL handling. | They already go through `BASE`. | n/a |
| C6 | Test on the Android Studio emulator (AVD), then a real phone. BlueStacks also works but is a separate install. | The emulator ships with Android Studio, so nothing extra to install. It reaches the laptop at `10.0.2.2`, which does not change when the Wi-Fi IP does. | BlueStacks: extra install; reaches the laptop by LAN IP like a phone. |
| C7 | Install Android Studio (not command-line tools only). | It bundles the SDK and Gradle setup; easiest for a first build. | Command-line SDK: smaller but more manual setup. |
| C8 | Build a DEBUG apk first. | Debug APKs install directly with no signing key. | Release APK / app bundle: needs a signing key; do this when publishing. |
| C9 | The app is for AUDITORS ONLY, and the server enforces it. Chosen by the user. | A phone app for one job should not open the manager's screens, and hiding them is not security. Every request from the app carries `X-App-Client: auditor-app`; the server refuses any other role, at sign-in and on every later request (`backend/app/auth.py`). | Hide screens only: a manager's token would still work. Check only in the app: bypassable. |
| C10 | An expired login sends the person to the sign-in screen with a message; the same person then carries on where they were. Only the token is cleared, never the offline audits. | Found by testing: a login older than 12 hours made every request fail, but the app kept showing normal screens with no data and nothing opened. | Lengthen the token: not needed to fix this; the idle/expiry policy waits for KPMG's numbers (P6). Wipe data on expiry: would lose an auditor's unsynced audit. |
| C11 | Tap targets are 40 px or more on a phone (the old compact sizes return from the `md` breakpoint up); form fields have a 44 px minimum on a phone. | The pencil and view buttons were 22-26 px; the issues page had about 140 elements under 32 px. | A global rule for every button: breaks dense desktop layouts. |
| C12 | The AI assistant button is not shown in the Android app. | It floated over the bottom-right of every page and its full-screen panel sat under the status bar; auditors do not use it on the phone, and it is off without a key. | Fix its placement only: kept for the website (its panel now respects the status-bar space). |

---

## 5. One-time setup on a new machine

Needed: Node 20+ (project used 22), Java 17+ (project used 21), Android Studio.

1. Install Android Studio (`winget install Google.AndroidStudio`, or download).
2. Open Android Studio once and finish the setup wizard. It downloads the
   Android SDK (normally `%LOCALAPPDATA%\Android\Sdk`).
3. Create `frontend/android/local.properties` (gitignored) with the SDK path.
   Use FORWARD slashes; single backslashes are eaten and the build fails with
   "The filename, directory name, or volume label syntax is incorrect":

   ```
   sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk
   ```

   Android Studio normally writes this file when it opens the project.
4. In `frontend/`: `npm install` (this also installs Capacitor).
5. If `frontend/android/` is missing (it is committed, so normally it is not):
   `npx cap add android`.

---

## 6. Build the APK (demo against the laptop)

1. Find the laptop's Wi-Fi IP: run `ipconfig`, look for "IPv4 Address" under
   the Wi-Fi adapter (it was `192.168.1.26` when this was written; it can
   change when the laptop reconnects).
2. Start the backend: `cd backend`, activate the venv, `python run.py`.
   It listens on `0.0.0.0:5050`. Allow it through Windows Firewall on
   private networks when prompted.
3. Build the web app with the server address and copy it into the Android
   project (from `frontend/`):

   ```powershell
   $env:VITE_API_BASE = "http://192.168.1.26:5050/api"
   npm run apk:sync
   ```

4. Build the APK. Either:
   - `npm run apk:open`, then in Android Studio: Build > Build Bundle(s) /
     APK(s) > Build APK(s); or
   - from `frontend/android/` in PowerShell: `.\gradlew.bat assembleDebug`. If
     that fails with "-classpath requires class path specification" (seen with
     Java 21.0.1), call the wrapper jar directly:

     ```powershell
     java "-Dorg.gradle.appname=gradlew" -classpath "gradle\wrapper\gradle-wrapper.jar" org.gradle.wrapper.GradleWrapperMain assembleDebug
     ```

     The first build downloads Gradle and takes a few minutes.
5. The file is `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.

Install it:
- Android Studio emulator (recommended, no extra install): in Android Studio
  open Device Manager, create a virtual device (e.g. Pixel 8, let it download
  a system image), start it, then drag `app-debug.apk` onto the emulator
  window, or press Run in Studio. Build with
  `VITE_API_BASE=http://10.0.2.2:5050/api` instead of the Wi-Fi IP. The
  emulator needs hardware virtualisation (Windows Hypervisor Platform or BIOS
  virtualisation) turned on.
- BlueStacks (optional, separate install): drag `app-debug.apk` onto the
  BlueStacks window. Use the laptop Wi-Fi IP address.
- Real phone: copy the file over (cable, Drive, email), tap it, allow
  "install unknown apps" for the app you opened it from.

The phone/BlueStacks must be on the SAME Wi-Fi as the laptop, and the backend
must be running. Log in with the seeded users (see `README.md`).

### When something is wrong

| Symptom | Likely cause |
|---------|--------------|
| Manager or admin cannot sign in on the phone | By design: the app is for auditors (C9). Use the website |
| Signed in but nothing loads or opens | The login expired. The app should now go to the sign-in screen; if it does not, check the build is current (`npm run apk:sync` and rebuild) |
| App says "You appear to be offline" at login | Wrong IP, backend not running, firewall blocking 5050, or different Wi-Fi. If the server IS reachable (test with `adb shell toybox nc 10.0.2.2 5050` on the emulator), check `android.allowMixedContent` is true in `capacitor.config.json` and re-run `npm run apk:sync` |
| Worked yesterday, not today | Laptop IP changed; rebuild with the new IP (or reserve a fixed IP in the router) |
| Blank screen | Forgot `npm run apk:sync` after changing the code, or build error in `vite build` |
| Changed code, app unchanged | Same: run `npm run apk:sync` and rebuild/reinstall the APK |
| Test the address first | Open `http://<ip>:5050/docs` in the phone browser; if that fails, the app will fail too |

---

## 7. How the offline behaviour fits in

Auditors work in stores with poor signal. The app saves answers on the device
first (IndexedDB) and syncs later; see `docs/decisions-offline-checklist.md`
and `docs/HANDOVER.md` section 2. This works the same inside the APK. The
login token is kept in localStorage so closing the app does not log the user
out (see the comment in `client.js`). The token expires server-side after
12 hours.

The service worker (`frontend/public/sw.js`) registers in production builds
and caches the app shell. Inside Capacitor the files are already local, so it
is harmless but not essential.

### Auditors only

The Android app is for auditors. Everything else is the website's job.

- **Server (the real rule):** inside the app every request carries
  `X-App-Client: auditor-app` (added in one place, `send()` in `client.js`). In
  `backend/app/auth.py`, `blocked_in_auditor_app` refuses any user whose role is
  not AUDITOR: at sign-in (403 "This app is for auditors. Please use the
  website.", and a `login_blocked_app` row in the audit log) and on every later
  request, so a manager's token cannot be used from the phone either. The
  website never sends the header, so it is unaffected. Tests:
  `backend/tests/test_auditor_app.py`.
- **App (friendly side):** the sign-in screen shows the message and keeps no
  login; a login left over from another role is discarded when the app starts;
  only the auditor demo account is listed. The auditor's menu is Dashboard,
  Audit Management, Action Taken Tracking and Email Communications.
- To change which role the app is for, change `AUDITOR_APP` handling in
  `backend/app/auth.py` and `allowedInThisApp` in `frontend/src/lib/appClient.js`
  together.

### When the login expires

Logins last 12 hours. A request with an expired token gets 401. The app now
treats that as "sign in again": it clears the token only, shows the sign-in
screen with "Your session expired. Please sign in again. Anything not yet sent is
still saved on this phone.", and keeps the offline audit database untouched (the
sync layer already treats 401 as "log in again", never as "rejected"). The same
person signing back in lands on the page they were on; anyone else starts at
their own home page. Before this, an expired login left normal-looking screens
with no data and nothing that opened.

---

## 8. Moving to a real hosted server (checklist)

Do these in order. No frontend screen code changes.

1. Host the backend on a server with a domain and a real HTTPS certificate
   (most platforms give this free).
2. Use Postgres: set `DATABASE_URL` (see `README.md`, "Running on Postgres").
   Do not rely on SQLite on a host that wipes its disk on redeploy.
3. Give `backend/uploads/` persistent storage (evidence photos and annexures
   live there), or move uploads to object storage.
4. In `backend/app/main.py`, replace `allow_origins=["*"]` with the real list:
   `https://localhost` (Capacitor's origin inside the APK) and the website's
   domain. Login uses a Bearer token, not cookies, so `*` works but is looser
   than needed.
5. In `frontend/capacitor.config.json`, delete the `server.cleartext` and
   `android.allowMixedContent` settings. HTTPS does not need either, and
   leaving mixed content on weakens the app.
6. Rebuild: `VITE_API_BASE=https://<domain>/api`, then `npm run apk:sync` and
   build the APK again.
7. For sharing outside the team, build a signed RELEASE build (Android Studio:
   Build > Generate Signed Bundle / APK). Keep the signing key safe; losing it
   means the app cannot be updated in place on the Play Store.

Because the address is baked into each build, keep one stable domain. If the
host changes, point the domain at the new host instead of rebuilding the app.

---

## 9. Known gaps (not done yet)

- Camera: the "take photo" button is a plain file input. Android permission
  entries for the camera and a proper camera plugin are not set up
  (`docs/HANDOVER.md`, "Capacitor wrapper" item). Check this before judging
  photo capture in the app.
- Custom app icon and splash screen: the default Capacitor ones are used. The
  web icons in `frontend/public/icons/` can be used as the source.
- No release signing key and no Play Store listing.
- No automated tests of the Android build itself; the frontend tests
  (`npm test`) and backend tests cover the logic only.
- Idle timeout: only the 12-hour expiry exists. An inactivity timeout and a
  shorter token with refresh wait for KPMG's numbers (`TODOS-for-Production.md`, P6).
- Tested on the Android Studio emulator (touch taps through the WebView's
  DevTools socket), not yet on a real phone, and not offline in airplane mode.
- The app id `com.retailsync.app` is a placeholder; change it in
  `capacitor.config.json` BEFORE the first real release, because it identifies
  the app permanently once published.

---

## 10. Commands cheat sheet (run from `frontend/`)

| Command | Does |
|---------|------|
| `npm run dev` | Website dev server on 5173 (proxies /api to 5050) |
| `npm run pwa` | Production build served on 4173 (PWA, see `decisions-pwa.md`) |
| `npm run apk:sync` | `vite build` then copy into the Android project |
| `npm run apk:open` | Open the Android project in Android Studio |
| `npx cap add android` | Recreate the Android project (only if missing) |
