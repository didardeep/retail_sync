# Generic demo workflow (whole product, about 15 minutes)

A role-by-role tour you can follow without memorising values. For the exact-clicks story with
a scripted audit, use `DEMO_SCRIPT.md`. For what every page does, see `PAGE_GUIDE.md`.

## 0. Before you start
1. Backend: `cd backend && python run.py` (port 5050). Frontend: `cd frontend && npm run dev`
   (prints its address; use that one, e.g. http://localhost:5175).
2. `cd backend && python demo.py prepare` (stages the data; safe to repeat).
3. Two browser windows: **A** normal Chrome (manager / admin), **B** Incognito at phone size
   (F12, Ctrl+Shift+M, iPhone 12 Pro). One browser profile holds only one login.
4. Password for every login: `password123`.

| Window | Login | Role |
|---|---|---|
| A | `admin@retail-chain.com` | Admin (sees everything) |
| A (later) | `am@retail-chain.com` | Audit Manager |
| B | `aud.amit.singh@retail-chain.com` | Auditor |
| optional | `sm.a.sharma@retail-chain.com` | Store Manager |

## 1. The flow: Plan -> Do -> Review -> Act

Say this up front: "A manager plans, an auditor does the audit on a phone, scores roll up into
dashboards, and problems become tracked actions."

### Step 1. Set up (Admin, window A) - 2 min
| Open | Show | Point to make |
|---|---|---|
| User Management | the user list, roles, Add User, deactivate | Admin creates accounts per role; a deactivated user is blocked at once |
| Store Management | store list, quarter scores, region and format filters, Dehire | One master list of stores |
| Audit Questions | tab **SOP tools**: Cash 77 marks, FMCG 92; version history; Edit | The audit tools are editable; every edit becomes a version and finished audits keep their marks |
| Audit Questions | tab **Question bank** | The classic checklist questions (Yes/No/Partial, critical ones raise issues) |

### Step 2. Plan (Audit Manager, window A) - 3 min
| Open | Do | Point to make |
|---|---|---|
| Dashboard and Analytics > **SOP Audits** tab | Look at the ranking and the **Audit coverage** panel; click a store | Which stores are weak and which are overdue; every chart is a filter |
| Audit Scheduling | **+ Schedule Audit**, pick an SOP tool, a store from the coverage panel, an auditor, a date | Clash check: try an auditor who is already booked that day and show the refusal |
| Audit Status | find the new audit | Planned and finished audits of both kinds live in one list |

### Step 3. Do the audit (Auditor, window B, phone size) - 4 min
Also show a **Checklist** audit: select a store, **Start** a checklist (Cashiering Checklist), answer with Yes / Partial / No / N/A one question per screen (a critical "No" warns it will raise an issue), Review, Submit: the result card shows the score and issues raised. Checklist audits need a connection; the scored audits below work offline.
1. Sign in as Amit Singh: he lands on a simple **Dashboard** (scheduled / in progress / submitted / cancelled / overdue, next up, drafts to finish, his numbers). Open **Audit**: **Scheduled for you** shows the audit just scheduled with the note; below it the **stores** list (select a store to see its audit options: Scored tools and Checklists, each with its state).
2. Start it. Type a score above the maximum to show validation. Answer a few questions.
3. A question with a required photo: add proof (use `docs/demo/sample-proof-float-cash.jpg`).
4. DevTools > Network > **Offline**. Answer two more questions: the chip says it saved on the device.
   Switch back to **No throttling**: it syncs by itself.
5. **Save & exit**, then **Resume**.
6. Resume the pre-staged **Ub City** draft (opens at the first unanswered question). Finish it, fix what Review flags, **Submit**.

Point to make: built for poor signal; nothing is lost; the review step catches missing proof before submit.

### Step 4. Review (Audit Manager, window A) - 3 min
| Open | Show | Point to make |
|---|---|---|
| Dashboard > SOP Audits tab (Refresh) | Ub City moved in the ranking; click it to see its history; click a row | Scores roll up instantly; each audit opens a full report with photos |
| Dashboard > **Overview** tab | Click a slice of any donut, then a score band, then Planned / Completed tiles | Every number opens the exact list behind it |
| Store Audit Scores | a store's four quarters and recent audits | Trend over time |
| Audit Log | the actions just taken | Accountability: who scheduled, submitted, published |

### Step 5. Act on findings (Store Manager) - 2 min
Sign out, sign in as `sm.a.sharma@retail-chain.com`.
| Open | Show | Point to make |
|---|---|---|
| My Store | quarter score, recent audits (click one), open issues | The store's own view; a manager sees only their store |
| Audit Checklist | tools collapsed; click a section to open | What the store is audited on, in plain language |
| Compliance Metrics | click a row to open its detail; click the Mismatch tile | Cash and expiry exceptions with drill-down |
| Action Taken Tracking | open an issue, change status to Resolved | Issues from audits are tracked to closure; only status and action taken are editable for a store manager |

## 2. Close (1 min)
Built: scheduled and unscheduled audits, offline phone audits with proof, versioned audit tools,
click-through dashboards, issue tracking, roles and audit log.
Honest next steps: approve / return step for SOP audits, issues raised automatically from low
SOP scores, Excel import screen, installable phone app, email module, AI assistant (needs a key).
Do not show: the Email page, the Power BI pop-up (sample data).

## 3. Quick fixes during the demo
| Problem | Do |
|---|---|
| Empty lists or errors | API stopped: restart `python run.py`, reload |
| Windows keep logging each other out | Window B must be Incognito |
| Phone window shows old audits | DevTools > Application > Clear site data |
| Run it again from scratch | `python demo.py prepare`, clear site data in both windows |
