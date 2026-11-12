# TODOs for Production

Things we deliberately did NOT do yet, so the app stays easy to develop and demo
on a laptop, plus everything that is blocked on KPMG access. Read together with
`docs/MOBILE_SECURITY_READINESS.md` (the full item-by-item gap analysis) and
`docs/ANDROID_APP.md` (how the APK is built).

Status key: TODO = not started. Each row says why it waits and what unblocks it.

---

## 1. Held back on purpose (would make development harder)

These are all ours to build. They wait only because they get in the way while
the app is still changing. Do them in a hardening pass before any real users.

| # | Item | Why it waits | What to do | Where |
|---|------|--------------|------------|-------|
| P1 | Account lockout and login rate limit | Locks the team out of seeded accounts during demos and tests. May also be replaced by Entra SSO. | Count failed logins per user and per IP, lock for N minutes after 5, log the lock. Keep it small and isolated. Confirm thresholds with KPMG. | `backend/app/routers/auth.py` (failed logins are already logged as `login_failed`) |
| P2 | Refuse to start without `JWT_SECRET` | Everyone would have to set an env var to run locally. Today it only logs a warning. | In prod config, raise at import if the secret is missing or equals the default. | `backend/app/auth.py` (`DEFAULT_SECRET`) |
| P3 | Disable `/docs`, `/redoc`, `/openapi.json` in prod | Swagger is how we explore the API today. | `FastAPI(docs_url=None, redoc_url=None, openapi_url=None)` when `ENV=prod`. | `backend/app/main.py` |
| P4 | `reload=False` and no debug in prod | Reload is needed for development. | Make `run.py` read an env var. | `backend/run.py` |
| P5 | Restrict CORS | `*` is what lets the web app, the APK and local tools all work. | Allow only `https://localhost` (Capacitor) and the real web domain. | `backend/app/main.py` |
| P6 | Idle (inactivity) timeout and shorter token with refresh | Auditors work offline for long stretches; a short idle timeout could log them out mid-audit. Needs a design that never loses unsynced work. | Idle timeout in the frontend, shorter JWT plus refresh. Agree numbers with KPMG. | `backend/app/auth.py` (`TOKEN_HOURS`), `frontend/src/api/client.js` |
| P7 | Wipe offline data on logout | Logging out would silently DELETE an auditor's unsynced audits. | On logout, if there are unsynced changes, warn and block (or force a sync) before clearing IndexedDB. Also needed for shared devices. | `frontend/src/lib/offlineStore.js`, logout in `client.js` / `Layout.jsx` |
| P8 | Evidence file ownership check | Evidence is uploaded first and linked to an audit/issue later, so there is no owner at upload time. Fixing it needs a lookup across answers and issues, and could break the auditee and store-manager flows. | Record uploader, and on read allow only the uploader or users who can see the audit/issue that references the file. Add a per-role test matrix. | `backend/app/routers/evidence.py` |
| P9 | Remove `server.cleartext` AND `android.allowMixedContent`, use HTTPS only | The laptop demo server has no certificate. | Delete both settings once the API is on HTTPS; keep a debug-only config if the laptop demo is still needed. | `frontend/capacitor.config.json` |
| P10 | Length limits on free-text and login fields | Safe, but needs a sweep of every schema so real data is not rejected. | Add `max_length` on Pydantic fields; check the Excel import paths. | `backend/app/schemas.py` |
| P11 | Frontend dependency upgrades with breaking changes | `npm audit fix --force` bumps Vite 5 to 8 and react-router 6 to 7; needs regression testing of every screen. | Upgrade in a branch, run `npm test`, `vite build`, click through. Production deps currently show 2 moderate findings (react-router); the rest are dev tooling. | `frontend/package.json` |
| P12 | Pin loose Python versions (`langchain-*`) | Pinning may pull in different behaviour. | Pin exact versions, run the test suite. | `backend/requirements.txt` |
| P13 | Android release build: R8/minify, release signing, real app id, ProGuard rules | Debug builds are enough for now; the app id is permanent once published. | Enable minify in `android/app/build.gradle`, create the signing config, agree the app id first. | `frontend/android/app/build.gradle`, `capacitor.config.json` |
| P14 | Camera permission and capture plugin | The photo button is a plain file input today. | Add the Capacitor camera plugin and the manifest permission. | `frontend/android/app/src/main/AndroidManifest.xml`, `components/Evidence.jsx` |
| P15 | Token into Android Keystore (secure storage) | Depends on the SSO decision: with Entra/MSAL the token store changes anyway. | Put token handling behind one wrapper in `client.js` first, then back it with a Keystore-backed plugin on Android. | `frontend/src/api/client.js` |
| P16 | Encrypt the offline IndexedDB store | Same: design depends on Intune and Keystore decisions, and adds sync complexity. | Encrypt records with a Keystore-held key, or move to an encrypted SQLite plugin. | `frontend/src/lib/offlineStore.js` |
| P17 | Log retention job (30 days online, 180 days archived) | The `audit_log` table also holds business history; agree what "logs" means before anything is deleted. | Scheduled export and purge; decide archive location with security operations. | `backend/app/models.py` (`AuditLog`) |
| P18 | Structured JSON logs | Plain logs are easier to read while developing. | Switch the logger format in prod. | `backend/app/main.py` |
| P19 | Certificate pinning, FLAG_SECURE (block screenshots) | Pinning can clash with corporate TLS inspection; FLAG_SECURE blocks demo screenshots. Only if KPMG requires. | Ask first (open questions below). | Android project |

---

## 2. Blocked on KPMG access, owners or decisions (group B)

We cannot build or finish these ourselves. "Ask" is the team that most likely
owns it; confirm with the project sponsor.

| # | Item | What we need | Ask |
|---|------|--------------|-----|
| B1 | SSO with Entra ID / AD | App registration (client id, tenant id, redirect URIs for web and APK). Backend then validates Entra tokens instead of issuing its own. | Identity / IAM team |
| B2 | MFA for all users, TOTP | Entra Conditional Access enforces it. We do NOT build our own MFA. | Identity / IAM team |
| B3 | OAuth / OIDC | Comes with Entra (MSAL). Our own JWT is not OIDC. | Identity / IAM team |
| B4 | Intune or MobileIron enrollment | Intune tenant, app registration in Intune, Intune App SDK / MAM wrapper for Android. Decides how the APK is distributed. | Endpoint / mobility team |
| B5 | Device certificate validation, device identity validation | Issued by Intune, checked by Conditional Access or a gateway. | Mobility and network teams |
| B6 | Remote wipe | Intune selective wipe. Our part: keep all data inside the app sandbox (true today). | Mobility team |
| B7 | Jailbreak / root detection | Prefer the Intune "block rooted devices" policy. Do not build our own until Intune is decided. | Mobility team |
| B8 | Privileged access approval process | A process; roles may come from Entra groups / PIM. | Identity team, app owner |
| B9 | Separate Dev / Test / UAT / Prod | The environments themselves. We make config env-driven; one APK build per environment (different `VITE_API_BASE`). | Infra owner |
| B10 | Hosting, TLS certificate, hardened servers, patching | A host with a real certificate and OS patch process. TLS 1.2+ is set at the proxy. | Infra owner |
| B11 | AES-256 at rest, encrypted backups, backup and DR implementation | Database and disk encryption and backup features of the hosting platform; we write the strategy (RPO/RTO, DB plus uploads). | Infra owner |
| B12 | Secrets vault | Prod secrets (`JWT_SECRET`, `GOOGLE_API_KEY`, DB URL) kept in a vault, not env files. | Infra / security |
| B13 | Enterprise monitoring, alerting, SIEM | Where logs ship to. We provide structured logs and `/api/health`. | Security operations |
| B14 | PAM integration | Privileged access to servers and DB through the KPMG PAM tool. | Security / infra |
| B15 | Code signing key, verified updates | Who owns the release signing key and how updates are distributed (Company Portal / managed Play). | Mobility team |
| B16 | Privacy assessment | KPMG privacy review. Big input: data sent to Google Gemini, personal data held (names, phones, emails). | Privacy team |
| B17 | Penetration test report | Third party or KPMG security, once a prod-like environment exists. | Security team |
| B18 | Security approval, architecture review | Formal sign-off using the artifacts in this repo. | Security / architecture board |

---

## 3. Questions that decide the rest

1. Is Entra ID SSO mandatory? Which tenant, and who registers the app?
2. Is MFA via Entra Conditional Access acceptable (so no in-app TOTP)?
3. Is Intune required, MDM (enrolled device) or MAM only (app protection)? How is the APK distributed?
4. Do any local (non-SSO) accounts stay, for example store staff without KPMG identities?
5. Where will it be hosted, and who owns the environments?
6. Which SIEM / monitoring and PAM tools, and where do archived logs live?
7. Is sending data to Google Gemini allowed? If not, which AI provider, or switch the assistant off.
8. Who owns the release signing key?
9. Required session idle and absolute timeouts, and lockout thresholds?
10. Is certificate pinning or screenshot blocking required?
11. Is iOS in scope?

---

## 4. Already done in the dev build (so nobody redoes it)

| Item | Where | Notes |
|------|-------|-------|
| Login success and failure written to the audit log (`login`, `login_failed`) with email attempted, IP and user agent; password never logged | `backend/app/routers/auth.py` | Test in `backend/tests/test_route_auth.py` |
| Startup warning when the default JWT secret is in use | `backend/app/auth.py` | Becomes a hard failure in P2 |
| Automated test that every API route refuses a request with no token (new routes are covered automatically; public routes are an explicit list) | `backend/tests/test_route_auth.py` | `/api/auth/login` and `/api/health` are the only public API routes |
| Android backup disabled (`allowBackup="false"`) | `frontend/android/app/src/main/AndroidManifest.xml` | Stops audit data and the token leaving via Android backup |
| Two non-breaking npm audit fixes (`postcss-selector-parser`, `source-map-js`) | `frontend/package-lock.json` | 139 frontend tests and the build still pass |

Not done because it does not apply yet: logging old and new role on a role
change. The update-user endpoint cannot change a role, so there is nothing to
log. Add it when role editing exists.

Known open item: `/docs`, `/redoc` and `/openapi.json` are reachable without a
token (see P3).

---

## 5. Decision log

| # | Decision | Why | Alternatives rejected |
|---|----------|-----|-----------------------|
| T1 | Split hardening into "do now" (cannot hurt development) and "held back" (section 1). | Keeps the app easy to demo and change while auth design is undecided. | Harden everything now: lockouts and short sessions interrupt demos and offline work. |
| T2 | Log failed and successful logins now, but do not add lockout yet. | Logging is invisible to users and survives any auth design; lockout may be replaced by SSO. | Lockout now: rework if Entra is mandated. |
| T3 | Warn about the default JWT secret instead of refusing to start. | Developers can still run with no setup. | Fail fast now: breaks every fresh checkout. |
| T4 | Do not wipe offline data on logout until unsynced work is handled. | An auditor in a poor-signal store could lose a whole audit. | Wipe always: simple, but data loss. |
| T5 | Route auth test walks the real route table. | New endpoints get checked without anyone remembering to. | Hand-written list of routes: goes stale. |
| T6 | Only `npm audit fix` (no `--force`). | Forced upgrades are major versions needing a full regression pass (P11). | Force now: risk to every screen. |
| T7 | Do not build own MFA/TOTP/root detection first. | Entra and Intune provide them; ours would be thrown away. See `MOBILE_SECURITY_READINESS.md` S2, S4. | Build now: possible waste. |
