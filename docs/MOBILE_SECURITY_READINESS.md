# Mobile App Security and Approval Readiness -- gap analysis

What is deliberately held back or blocked on KPMG is tracked in `docs/TODOS-for-Production.md`.

Source: the simplified checklist derived from MOBILE_APP_REQUIREMENTS.xlsx.
Every item is sorted into one group:

- A = can be done now, to the whole app (backend + web + APK), no outside access
- B = production only, blocked on access/owners/decisions we do not have
- C = Android-app specific

State: Done / Partial / Missing. Effort: S (under a day), M (days), L (week+).

## Facts found in the code (as of 2026-11-12)

- Login: `backend/app/routers/auth.py` -- username + password, returns a JWT.
  No lockout, no rate limit, no MFA, no login event logged.
- Passwords: Werkzeug `generate_password_hash` (salted PBKDF2/scrypt), `backend/app/auth.py:21`.
- Token: HS256 JWT, 12 h expiry, no refresh, no revocation/logout on server,
  `backend/app/auth.py:14-36`. Secret falls back to `"dev-secret-change-me"` if
  `JWT_SECRET` is unset (`auth.py:14`).
- Inactive users are rejected on every request (`auth.py:50`) -- good.
- RBAC: `require_roles` / `get_staff_user` guard endpoints server-side (`auth.py:55-73`).
- Audit log: `AuditLog` table (`models.py:46`), `log_action` (`services/__init__.py:139`);
  used for audit actions, user create/update (`routers/admin.py:103,158`), annexures.
  Viewer: `GET /api/audit-logs`, last 500 rows (`routers/audit_log.py`).
  Not logged: logins, failed logins, logouts. Role change is logged only as
  `update_user` with field names, not old/new role. No retention policy.
- CORS: `allow_origins=["*"]` (`main.py:30`).
- Uploads: evidence has extension allowlist, 50 MB cap, random stored names,
  auth required to read (`routers/evidence.py`). Read checks login only, not
  that the user may see that audit.
- Input validation: Pydantic schemas; ORM queries (no raw SQL with user input
  found; raw `text()` only in `db.py` reset code).
- AI assistant sends questions/data to Google Gemini (`services/assistant_service.py:723`)
  -- a privacy/data-residency item.
- Web token storage: localStorage (`frontend/src/api/client.js:6-20`).
- Offline data: IndexedDB `retailsync-checklist`, unencrypted (`frontend/src/lib/offlineStore.js`).
- Android: `android:allowBackup="true"`, only INTERNET permission
  (`frontend/android/app/src/main/AndroidManifest.xml`); `server.cleartext: true`
  (`frontend/capacitor.config.json`); app id `com.retailsync.app` placeholder;
  debug signing only.
- Supply chain: pinned Python versions (`backend/requirements.txt`), npm lockfile;
  no CI (`.github/` absent), no SAST, no dependency scan; `npm install`
  reported 6 known vulnerabilities (4 moderate, 2 high).
- Tests: backend pytest suite and frontend node tests exist; none are security tests.

---

## 1. Authentication and user login

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| SSO with Entra ID / AD | B | Missing | L | Needs a KPMG Entra app registration (client id, tenant id, redirect URIs for web + APK). Ask: KPMG IAM / identity team. Backend then validates Entra tokens instead of issuing its own. |
| MFA for all users | B | Missing | S once SSO exists | Enforced by Entra Conditional Access, not by our code. Ask: IAM team. Do NOT build our own MFA (rework). |
| TOTP support | B | Missing | - | Comes with Entra MFA (Authenticator app). Only build in-app TOTP if KPMG says local accounts must stay. |
| Password masking | A | Done | - | Login form uses a password input. Verify on the APK. |
| Account lockout | A | Missing | S | Count failed logins per user (new columns or table), lock for N minutes after 5 failures, log it. Becomes moot for SSO users; keep it for any break-glass local account. |
| Session timeout | A | Partial | S | JWT expires at 12 h (absolute). Add an idle timeout in the frontend (e.g. 30 min) and a shorter token + refresh. Confirm the required numbers with KPMG. |
| No anonymous access | A | Partial | S | All data routers use `get_current_user`; `/api/health` and `/docs` are open. Disable `/docs` in prod, add a test that walks every route without a token and expects 401. |

## 2. Mobile device security

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| Intune / MobileIron enrollment | B | Missing | L | Needs KPMG Intune tenant, app registration in Intune, and the Intune App SDK / MAM wrapper for Android. Ask: KPMG endpoint/mobility team. Decides how the APK is distributed (Company Portal, not sideloading). |
| Device certificate validation | B | Missing | L | Issued by Intune (SCEP/PKCS) and checked at a gateway or by Entra Conditional Access. Ask: mobility + network teams. |
| Jailbreak/root detection | C | Missing | M | Plugin (root-detection) or rely on Intune MAM "block rooted devices" policy. Prefer the Intune policy if Intune is mandated. |
| Remote wipe | B | Missing | - | Intune selective wipe of app data. Needs Intune. Our part: keep all app data inside the app sandbox (already true). |
| App sandbox / container | C | Partial | S | Android sandbox by default. Intune MAM adds the managed container. |
| Encrypted local storage | C | Missing | M | IndexedDB offline audits are plain. Options: encrypt records with a key held in Android Keystore, or move offline store to an encrypted SQLite plugin. See C-items below. |

## 3. Authorization and roles

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| RBAC model | A | Done | - | `require_roles`, roles in `models.py`. Write a role/permission matrix doc. |
| Least privilege | A | Partial | M | Query filters scope data per role. Gap: evidence files readable by any logged-in user who has the URL. Add per-file ownership check; add a test matrix per role. |
| Separate admin and user functions | A | Partial | S | Admin routes require `ROLE_ADMIN`. Document it; consider hiding admin from the APK build. |
| Privileged access approval process | B | Missing | - | A process, not code. If Entra is used, roles can come from Entra groups/PIM. Ask: KPMG IAM / app owner. |

## 4. Logging and audit trail

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| Log authentication events | A | Missing | S | `log_action` on login success, failure (with username, IP, user agent), lockout, logout. |
| Log admin actions | A | Partial | S | User create/update logged; check every admin route calls `log_action`. |
| Log role changes | A | Partial | S | Log old and new role explicitly, not only field names. |
| Retention 30 d online / 180 d archived | A+B | Missing | M | A: a scheduled job that exports rows older than 30 days to an archive file and deletes after 180. B: where the archive lives in prod (SIEM / storage) -- ask the security operations team. Note: today the AuditLog also holds business history; agree what "logs" means before deleting anything. |

## 5. Encryption

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| TLS 1.2+ in transit | A+B | Missing | S | A: document required TLS config, reverse proxy example (TLS 1.2 minimum). B: certificate and host in prod. APK: remove cleartext (C). |
| AES-256 at rest | B | Missing | M | Database and disk encryption are provided by the hosting platform (Postgres/storage encryption). Ask: hosting/infra owner. Device side: see encrypted local storage (C). |
| Encrypted credentials | A | Partial | S | Passwords hashed. Secrets (`JWT_SECRET`, `GOOGLE_API_KEY`, DB URL) are env vars; remove the default JWT secret fallback (fail to start instead). Prod secrets in a vault (B). |
| Encrypted backups | B | Missing | - | Platform backup feature. Ask: infra owner. |

## 6. Secure mobile storage

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| iOS Keychain | - | N/A | - | No iOS build. Becomes C if iOS is added. |
| Android Keystore | C | Missing | M | Move the login token from localStorage into Keystore-backed secure storage via a Capacitor secure-storage plugin, through a small storage wrapper in `client.js` (web keeps localStorage). |
| No secrets in plain storage | A+C | Partial | S | No API keys in the frontend. Token in localStorage (web) is the gap; APK fixed by Keystore. |

## 7. API security

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| OAuth / OIDC | B | Missing | L | Comes with Entra (MSAL). Our own JWT is not OIDC. |
| Token validation | A | Done | - | Signature + expiry checked on every request; user active check. Will switch to validating Entra tokens (issuer, audience, signing keys) later. |
| Device identity validation | B | Missing | - | Via Intune compliance + Conditional Access. |
| Authorization on all APIs | A | Partial | S | Add an automated test listing every route and asserting it requires auth (plus per-role checks). Fix evidence ownership. Restrict CORS. |

## 8. Secure coding

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| Input validation | A | Partial | S | Pydantic everywhere; add length limits (e.g. LoginRequest, free-text remarks) and check Excel import paths. |
| Injection protection | A | Done | - | ORM only; React escapes output. Confirm no `dangerouslySetInnerHTML` (none found). |
| Dependency management | A | Partial | S | Pinned versions + lockfile. Fix the 6 npm audit findings; `pip-audit` for Python; unpin-to-range items (`langchain-*`) should be pinned. |
| Static code scanning | A | Missing | S | Add Bandit (Python) and ESLint security rules / Semgrep; run locally now, in CI later. |

## 9. Deployment and infrastructure

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| Separate Dev/Test/UAT/Prod | B | Missing | M | A: make config env-driven (already mostly) and document per-env settings; one APK build per env (different `VITE_API_BASE`). B: the environments themselves. Ask: infra owner. |
| Patch management | B | Missing | - | Platform/OS patching. Process owned by infra. |
| Vulnerability management | A+B | Missing | S | A: dependency + SAST scans (section 8). B: org scanner and remediation SLA. |
| Hardened environments | B | Missing | - | Infra. Our part: disable `/docs` and debug in prod, `reload=False` in `run.py` for prod. |

## 10. Software supply chain

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| Supported libraries only | A | Partial | S | Check versions are maintained (FastAPI, React 18, Vite 5, Capacitor 8). |
| Code signing | C+B | Missing | M | C: release build signing config. B: the signing key/cert itself and where it is kept -- ask KPMG mobility team (may be re-signed by Intune). |
| Dependency inventory (SBOM) | A | Missing | S | Generate CycloneDX SBOMs for Python and npm. |
| Verified updates | B | Missing | - | Distribution via Intune Company Portal / managed Play. Ask: mobility team. |

## 11. Monitoring and operations

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| Enterprise monitoring | B | Missing | M | Ship logs to KPMG SIEM/APM. A part: structured JSON logs + `/api/health` (exists). |
| Alerting | B | Missing | - | Org tooling. |
| PAM integration | B | Missing | - | Privileged access to servers/DB via KPMG PAM (e.g. CyberArk). Ask: security / infra. |
| Operational runbooks | A | Partial | M | Docs exist (HANDOVER, DB_Migrations, ANDROID_APP). Add deploy, rollback, restore, incident and key-rotation runbooks. |

## 12. Governance and approval artifacts

| Item | Grp | State | Effort | Approach |
|------|-----|-------|--------|----------|
| Architecture diagram | A | Partial | S | Text diagram in `docs/ANDROID_APP.md`; produce a proper one. |
| Data flow diagram | A | Missing | S | Include Gemini (external AI) and uploads. |
| Threat model | A | Missing | M | STRIDE draft from the facts above. |
| Privacy assessment | B | Missing | - | KPMG privacy team. Big input: data sent to Google Gemini, personal data held (names, phones, emails). |
| Pen test report | B | Missing | - | Third party / KPMG security after a prod-like env exists. |
| Backup and DR strategy | A+B | Missing | S | A: write the strategy (RPO/RTO, what to back up: DB + uploads). B: implement on the host. |

## Android-specific items not in the checklist but expected (group C)

| Item | State | Effort | Approach |
|------|-------|--------|----------|
| Remove `server.cleartext` | Missing | S | Only once an HTTPS server exists; keep for laptop demo via a debug-only config. |
| `allowBackup="false"` / backup rules | Missing | S | Stops audit data and token leaving via Android backup. |
| Certificate pinning | Missing | M | Optional; check with KPMG (pinning can conflict with corporate TLS inspection). |
| FLAG_SECURE (block screenshots) | Missing | S | Ask KPMG whether required; it also blocks demo screenshots. |
| R8 / minify on release | Missing | S | Enable in `android/app/build.gradle` release type. |
| Camera permission + plugin | Missing | M | For evidence photos. |
| Real app id | Missing | S | Agree before first real release (permanent once published). |
| Logout clears offline data | Missing | S | On logout, wipe IndexedDB as well as the token (needed for shared devices and selective wipe). |

## Readiness tracker mapping

| Tracker item | Group | State |
|--------------|-------|-------|
| MFA | B | Missing |
| SSO | B | Missing |
| RBAC | A | Done (needs doc + tests) |
| Audit Logging | A | Partial |
| TLS 1.2+ | A+B | Missing |
| AES-256 | B (server), C (device) | Missing |
| Secure Storage | C | Missing |
| Intune Integration | B | Missing |
| Jailbreak Detection | C | Missing |
| Remote Wipe | B | Missing |
| API Security | A | Partial |
| SAST Scan | A | Missing |
| Dependency Scan | A | Missing |
| Code Signing | C+B | Missing |
| Monitoring | B | Missing |
| Backup and DR | A+B | Missing |
| Architecture Review | A (artifacts), B (review) | Partial |
| Pen Test | B | Missing |
| Security Approval | B | Missing |

## Do this first (in order)

1. Ask KPMG the open questions below -- especially SSO and Intune, because they decide the auth design.
2. Log auth events (login ok/fail, lockout, logout) and old/new role on role change. (A, S)
3. Account lockout + rate limit on `/api/auth/login`. (A, S)
4. Remove the default JWT secret; disable `/docs` and `reload` in prod config. (A, S)
5. Evidence file ownership check + a test that every route needs auth. (A, S-M)
6. Dependency scan (npm audit fixes, pip-audit) + SAST (Bandit, Semgrep) + SBOM. (A, S)
7. Android: `allowBackup="false"`, wipe offline data on logout, R8 on release. (C, S)
8. Android: token into Keystore-backed secure storage behind a storage wrapper. (C, M)
9. Architecture diagram, data flow diagram (incl. Gemini), threat model draft. (A, M)
10. Backup/DR and log retention write-ups ready for infra. (A, S)

## Rework risk: what SSO/Intune would change

- If KPMG mandates Entra SSO + MFA, our password login, lockout, session
  timeout and token issuing largely go away; Entra handles them. So: keep
  lockout/timeout small and isolated, and do NOT build our own MFA or TOTP.
- Put token handling behind one interface (get/set/clear token, attach header)
  in `client.js`. Then the swap to MSAL tokens (and Keystore) changes one file.
- Backend: keep authorization (`require_roles`, query scoping) separate from
  authentication (`get_current_user`). Only `get_current_user` changes when it
  starts validating Entra tokens; roles can be mapped from Entra groups.
- If Intune MAM is mandated, the app may need the Intune App SDK, which works
  best with MSAL. Root detection and wipe then come from Intune policy;
  building our own root detection first could be wasted.
- Logging, RBAC tests, scans, docs and Android hardening (backup, R8, wipe on
  logout) are safe to do now -- they survive any auth choice.

## Open questions for KPMG

1. Is Entra ID SSO mandatory? Which tenant, and who registers the app?
2. Is MFA via Entra Conditional Access acceptable (so no in-app TOTP)?
3. Is Intune required -- MDM (enrolled device) or MAM only (app protection)? How is the APK distributed?
4. Do any local (non-SSO) accounts stay, e.g. for store staff without KPMG identities?
5. Where will it be hosted (KPMG cloud subscription?), who owns the environments?
6. Which SIEM/monitoring and PAM tools, and log retention location?
7. Is sending data to Google Gemini allowed? If not, which AI provider, or disable the assistant.
8. Who owns the release signing key?
9. Required session idle/absolute timeouts and lockout thresholds?
10. Is certificate pinning or screenshot blocking required?
11. Is iOS in scope?

## Decision log

| # | Decision | Why | Alternatives rejected |
|---|----------|-----|-----------------------|
| S1 | Sort each item into A (now), B (blocked), C (Android). | Lets the team start A and C without waiting on KPMG access. | One flat list: hides what is blocked. |
| S2 | Do not build own MFA/TOTP. | Entra provides it; ours would be thrown away. | Build TOTP now: rework if SSO is mandated. |
| S3 | Token handling behind one wrapper before Keystore/MSAL. | Keeps the later auth swap to one file. | Call storage directly: many edits later. |
| S4 | Prefer Intune policy over custom root detection, pending answer. | Avoids duplicate controls. | Build root detection now: possible waste. |
| S5 | Do the logging, scans, docs and Android hardening first. | Valid whatever auth design is chosen. | Wait for KPMG answers: loses time. |
