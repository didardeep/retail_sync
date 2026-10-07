# Demo script: store audits, from planning to insight

About 14 minutes. Two roles on screen (a manager at a desk, an auditor on a phone), one story:
**find a store that has not been audited, schedule the audit, run it on a phone even with no signal,
finish and submit another, and watch the numbers move.**

Every step below was rehearsed end to end on the real app on 6 Oct 2026 (see section 9).

---

## 1. The story in one paragraph

A retail chain with ten stores audits cash handling and FMCG shelves against fixed SOP checklists.
Today that is paper and Excel: scores are added by hand, findings get lost, and nobody can say which
store has not been visited. This tool puts the same two checklists (Cash, 77 marks; FMCG, 92 marks) in one
place. A **manager** sees where the gaps are, schedules audits and edits the checklists. An **auditor**
runs the audit on a phone, scoring each question against the Best / Average / Least description, adding
photo proof, and keeps working when the signal drops. Scores roll up instantly into a dashboard.

| Act | Who | What | Time |
|-----|-----|------|------|
| 1 | Manager | The audit tool: questions, marks, versions | 2 min |
| 2 | Manager | Find the gap on the dashboard | 2 min |
| 3 | Manager | Schedule an audit (and see a double booking refused) | 2 min |
| 4 | Auditor, phone | Start it: rubric, validation, photo proof, losing signal | 3 min |
| 5 | Auditor, phone | Finish one: review, fix what is flagged, submit | 2 min |
| 6 | Manager | See the impact and drill to the report | 2 min |
| - | - | Wrap-up and what comes next | 1 min |

Short on time? Cut Act 1 to the version history, and skip the offline step in Act 4 (but keep it if the
audience cares about stores with poor signal; it is the strongest moment).

---

## 2. Before you start (15 minutes ahead)

### 2.1 Start the app
From the project folder, in two terminals:
```
cd backend
python run.py                      # API on port 5050
```
```
cd frontend
npm run dev                        # prints the address, normally http://localhost:5173
```
If port 5173 is taken, Vite uses the next one (5174). Use whatever address it prints; the rest of this
document says "the app".

### 2.2 Stage the data
```
cd backend
python demo.py prepare
```
This publishes version 2 of the Cash tool (photo required on Float Cash, comment required on Shortage
Management), stages a nearly finished audit at Ub City for the demo auditor, and removes anything created
during a previous run. It prints the demo logins. It is safe to run any number of times.
After `python seed.py --reset` use `python demo.py prepare --new-baseline` instead.

### 2.3 Two windows (important)
The app keeps the login in the browser's storage, so a manager and an auditor **cannot share one browser
window or profile**: signing in as one signs the other out.

| Window | Browser | Role | Setup |
|--------|---------|------|-------|
| **A** (desk) | Normal Chrome | Audit Manager | Full screen |
| **B** (phone) | Chrome **Incognito** window | Auditor | F12, then the device toolbar (Ctrl+Shift+M), choose iPhone 12 Pro (390 x 844). Keep DevTools open: you need its Network tab for the offline step |

Sign in at the app address:

| Role | Login | Used in |
|------|-------|---------|
| Audit Manager | `am@retail-chain.com` | Window A, acts 1, 2, 3, 6 |
| Auditor (Amit Singh) | `aud.amit.singh@retail-chain.com` | Window B, acts 4, 5 |
| Store Manager | `sm.a.sharma@retail-chain.com` | optional, "what does a store manager see" |
| Admin | `admin@retail-chain.com` | optional, user management |

The password for every login is printed at the end of `python demo.py prepare`.

### 2.4 Check these numbers before you go on (Window A)
Dashboard and Analytics, then the **SOP Audits** tab:

| You should see | Value |
|----------------|-------|
| Audits submitted | 68 (10 of 10 stores covered) |
| Average score | 68.2% (target 80%) |
| Stores below 70% | 5 |
| Store ranking, top 3 | Phoenix Mall 86.4, DLF Avenue 81.0, South City 78.6. Ub City is 4th at 77.9 |
| Audit coverage panel | **Pacific Hub 62 days ago, South City 41 days ago**, "8 of 10 stores covered" |
| Audit Questions, SOP tools | Cash Audit Tool **Version 2**; FMCG Audit Tool Version 1 |

If those match, you are ready. Also have this file handy for the photo step:
`docs/demo/sample-proof-float-cash.jpg`

---

## 3. The cast and the data you will use

| Item | Value |
|------|-------|
| Tool for the live booking | Cash Audit Tool (77 marks, version 2) |
| Store for the live booking | **South City** (Kolkata): not audited for 41 days |
| Auditor | **Amit Singh** |
| Date | **9 Oct 2026**, 10:00 |
| Conflict example | **Priya Das** is already booked at Select Citywalk on **8 Oct, 11:00**; trying to book her at **DLF Avenue on 8 Oct** is refused |
| Audit to finish | **Ub City**, Cash tool, staged at 17 of 21 answered |
| Score you will type | up to the question's marks (5 for the last four questions) |
| Comment to type | "Shortage register checked for the last 5 days; all shortages recorded and signed." |

---

## 4. Act 1: The audit tool (Manager, Window A, 2 min)

**Do**
1. Sidebar: **Audit Questions**, then the **SOP tools** tab.
2. On the Cash card click **Show version history**.
3. Click **Edit** on the Cash card. Scroll the first few questions.
4. (Optional) change the marks of question 1 from 2 to 3 and press **Review changes**. Read the summary,
   then **Back to editing**. Do **not** publish.

**Say**
- "These are your two SOP checklists, loaded from your spreadsheet: Cash is 77 marks, FMCG is 92."
- "Each question has marks and three descriptions: what Best looks like, Average, and Least. That is what the
  auditor scores against."
- "When a manager changes a checklist it becomes a new version. Version 2 added a required photo for the float
  cash check. The 41 audits already done stay on version 1 with the marks they were scored with, so
  history never changes underneath you."
- (Step 4) "Before anything is published the manager sees exactly what changed, and has to say why."

**You should see**
- Version 2 (Current): the note "Proof now required: a photo for the float cash check and a comment for
  shortage records", 1 audit. Version 1: 41 audits.
- In the editor, the question wording, marks, Best / Average / Least text, and three switches (N/A by
  default, Comment required, Photo required). Float Cash has Photo required switched on.
- (Step 4) "1 change ... Marks: 2 -> 3 ... Publish version 3 (needs a note)".

**Afterwards**: leave the editor with **Back to SOP tools**. If a "restore unsaved changes" banner ever
appears, you left an edit behind; see section 8.

---

## 5. Act 2: Find the gap (Manager, Window A, 2 min)

**Do**
1. Sidebar: **Dashboard and Analytics**, then the **SOP Audits** tab.
2. Point at the four tiles, then the **Store ranking** chart.
3. Scroll to **Audit coverage**. Click **South City**.
4. Look at the audits table, then **Gap by section** and **Where marks are lost**.
5. Press **Clear all** (next to the "Showing ... audits" line).

**Say**
- "One screen answers: how are we doing, where are we weakest, and who have we not looked at?"
- "Five stores are below 70%. The coverage panel says Pacific Hub has not been audited for 62 days and South
  City for 41. That is the kind of thing that is invisible today."
- "Every chart is clickable. I click South City and the whole page focuses on it. The address in the browser
  holds the filter, so I can send this exact view to a colleague."
- "Gap by section shows which parts of the checklist lose the most marks across stores. Where marks are lost
  ranks individual questions, with the cumulative line showing how few questions account for most of the
  loss."

**You should see**
- After the click: the page header chip "Store: South City", "Showing 4 of 68 audits" (or similar), the
  table listing South City's audits with their scores.
- "Clear all" restores all 68.

---

## 6. Act 3: Plan the audit (Manager, Window A, 2 min)

**Do**
1. Sidebar: **Audit Scheduling**, then **+ Schedule Audit**. Keep **SOP tool** selected.
2. First the conflict: Audit tool **Cash Audit Tool - 77 marks (v2)**, Store **DLF Avenue - Delhi**, Auditor
   **Priya Das**, Date **08/10/2026**. A yellow warning appears. Press **Schedule**: a message refuses it.
3. Now the real booking: change Store to **South City - Kolkata**, Auditor to **Amit Singh**, Date to
   **09/10/2026**, Notes "Overdue coverage: South City not audited in 41 days". Press **Schedule**.

**Say**
- "The manager picks the checklist, the store, the auditor and the date."
- (Conflict) "Priya is already booked at another store that day. The system tells me before I save, and refuses
  if I try anyway: *Auditor is already booked that day at Select Citywalk (11:00)*. The same rules cover
  leave and blocked dates."
- (Real booking) "Amit is free, so it goes through."

**You should see**
- The yellow line: "Auditor is already booked that day at Select Citywalk (11:00). Saving will be refused."
- After the real booking: the toast "SOP audit scheduled" and a new row "Cash Audit Tool v2 / South City /
  09 Oct 2026 10:00 / Amit Singh / Assigned". The "Scheduled" tile goes up by one.

---

## 7. Act 4: The auditor in the store (Auditor, Window B, 3 min)

**Do**
1. In Window B, sign in as Amit Singh. You land on **SOP Audits**.
2. Under **Assigned to me** tap **Start** on **South City**.
3. Question 1: type **99**. Read the error, tap **Next** (it will not move). Change it to **1.5**, tap **Next**.
4. Question 2, **Float Cash**: read "A photo is required for this question". Type **2**. Tap **Add proof /
   comment**, then **Take photo** (on a real phone this opens the camera; in the emulator pick
   `docs/demo/sample-proof-float-cash.jpg`), then **Done**. The button now says "1 photo".
5. **Lose signal:** DevTools, Network tab, throttling list, choose **Offline**. The chip turns to "Offline".
6. Answer the next two questions (type **2**, tap Next; type **1.5**, tap Next). The chip reads **"Offline - 1
   saved on device"** and the screen says "4 of 21 answered".
7. **Get signal back:** Network throttling, **No throttling**. Within a few seconds the chip returns to
   **Synced**.
8. Tap **Save & exit**.

**Say**
- "The auditor sees exactly what the manager scheduled, with the manager's note. The overdue Pacific Hub visit
  is flagged in red."
- "One question per screen: the question, what Best looks like, what Least looks like, and the score box.
  Typing 99 on a 2-mark question is refused on the spot. Scores move in half marks."
- "This question needs photo proof because the checklist says so. No photo, no way to submit."
- "Now the part that matters for real stores: the signal drops. The auditor keeps going. Everything is saved on
  the phone first, and the chip says so. The server still has only the first two answers."
- "Signal returns and it syncs on its own. Nothing lost, nothing duplicated."
- (Save & exit) "He can stop any time; the audit waits as In progress."

**You should see**
- Assigned to me: Cash Audit Tool v2 / Pacific Hub / **Overdue** (red) and Cash Audit Tool v2 / South City
  with the manager's note.
- The error "Maximum is 2"; the red box around the score; the page staying on question 1.
- The warning "A photo is required for this question", disappearing after the photo.
- Chip text: Offline, then "Offline - 1 saved on device" (the number is audits waiting to sync, not answers),
  then Synced.
- Back on the list, South City shows **In progress** and a **Resume** button.

---

## 8. Act 5: Finish an audit (Auditor, Window B, 2 min)

**Do**
1. Scroll to **My audits** and tap the **Ub City** row marked **Draft v2**.
2. It opens at **Section D, Returns / Refunds** ("17 of 21 answered"). Type **5**, tap **Next**. Do the same for
   the next three questions (Impulse Bay Management 5, Free Gifts at CSD 5, Expiry Management 5). On the
   last one the button says **Review**.
3. The review screen shows **70 / 77, 90.91%** and "2 items need attention before you can submit".
   **Submit audit** is greyed out.
4. Tap the **Float Cash** row (marked "Photo required"). Add a photo (same steps as before). Tap **Review** in
   the top right.
5. Tap the **Shortage Management** row (marked "Comment required"). **Add proof / comment**, type the comment,
   **Done**. Tap **Review** in the top right.
6. The screen says "Everything is answered. Ready to submit." Tap **Submit audit**, then **Submit**.

**Say**
- "He was in Ub City earlier and had this audit in progress. It opens exactly where he stopped."
- "Before it can be submitted, the review screen lists everything that is incomplete: unanswered questions, a
  required photo, a required comment. Tap one to fix it, then jump back to the review."
- "On submit the score is locked: 70 out of 77. Even if he did this offline it would send itself when the
  signal returned."

**You should see**
- Review banner "2 items need attention", the two flagged rows in red, then the green "Everything is answered".
- The confirm box "Submit this audit? Score 70 / 77 (90.91%). You will not be able to change it after
  submitting." and then you are back on the list.

---

## 9. Act 6: The impact (Manager, Window A, 2 min)

**Do**
1. Window A: Dashboard and Analytics, **SOP Audits** tab, press **Refresh**.
2. Point at the ranking. Then search or click **Ub City** to focus on it.
3. In the audits table click the newest Ub City row (06 Oct 2026, 90.9%).
4. Press **Back**. Open **Audit Status** and **Audit Scheduling** for a moment.
5. (Optional) **Export CSV** on the dashboard.

**Say**
- "The submission is in the numbers immediately. Ub City went from fourth to first, 77.9% to 90.9%."
- "Here is its history: 66, 70, 71, 78, now 91. Each row opens the full report: every question's score, the
  photo and the comment as proof."
- "The same audit now shows as Submitted on Audit Status, next to the audits already scheduled, so planning
  and results live in one list."
- "South City is on the schedule for 9 October. Once Amit submits it, it drops off the coverage panel."

**You should see**
- Ub City top of the ranking at 90.9%; the tile "Audits submitted" at 69.
- The Ub City history 66.2, 70.1, 70.8, 77.9, 90.9 with the change since the previous audit.
- The report: section subtotals, each question's score, the Float Cash photo, the Shortage comment.

---

## 10. Wrap-up: what exists and what is next

**Built and demonstrated**: the two checklists with versioning; the dashboard with click-through; scheduling
with clash checks; the phone experience with proof photos and offline working; review-before-submit;
automatic roll-up of scores.

**Say what is not there yet (honestly)**
- Low scores do not yet raise follow-up actions for the store manager automatically. The older checklist
  audits do; connecting the two is the next step.
- A manager approve / return step before an audit counts is planned, not built.
- The phone app wrapper (so it installs from an app store) is not built; today it runs in the phone's
  browser.
- The AI assistant button needs a Google API key to be switched on; skip it unless that is set up.

---

## 11. If something goes wrong

| Symptom | Fix |
|---------|-----|
| Lists are empty, or "Select an audit tool" has no options | The API is not running or is restarting. Check `http://localhost:5050/api/health`, restart `python run.py`, reload the page |
| The two windows keep signing each other out | They share a browser profile. Window B must be an **Incognito** window (or another Chrome profile) |
| Window B still shows a previous run's audits | Clear that window's site data: DevTools, Application, Storage, **Clear site data** |
| The coverage panel does not list South City | You booked and submitted South City in a previous run: run `python demo.py prepare` |
| A "restore unsaved changes" banner in the editor | A previous edit autosaved. Press F12 and run `Object.keys(localStorage).filter(k=>k.startsWith('sop-editor:')).forEach(k=>localStorage.removeItem(k))` |
| After editing code the backend does not pick up changes | Stop and start `python run.py` (its auto-reload can stall while the browser holds connections open) |
| The Network "Offline" switch changes nothing | Make sure you are in the phone window's DevTools, and the Network tab is selected |
| Photo picker does not open in the emulator | Click **Gallery** instead of **Take photo** and pick `docs/demo/sample-proof-float-cash.jpg` |

## 12. Questions you will probably get

| Question | Answer |
|----------|--------|
| What if the auditor never gets signal all day? | Everything is saved on the phone and sends when a connection returns, even days later, as long as they sign in again if their login expired (12 hours). Photos are shrunk on the phone first so they upload quickly |
| Can we change the questions or marks? | Yes, on the Audit Questions page; each change becomes a new version and finished audits keep the version they were done on |
| Can an auditor see other auditors' audits? | No. Auditors see their own; store managers see finished audits of their own stores, read-only; managers see everything |
| Can we get the data out? | The dashboard table exports to CSV; a full Excel report is planned |
| Does it work on iPhone and Android? | It runs in the phone browser today. A packaged app is planned |
| Who can schedule? | Audit managers and admins. The system also refuses to book an auditor on a day they are on leave or already elsewhere |

---

## 13. Reset for the next run

1. `cd backend` then `python demo.py prepare`. It deletes everything created during the previous run, restores
   the staged Ub City draft, and keeps the checklist at version 2.
2. In both browser windows: DevTools, Application, Storage, **Clear site data** (this empties the phone's
   saved audits and any unsaved editor draft).
3. Re-check the numbers in section 2.4.

If the database was rebuilt with `python seed.py --reset`, run `python demo.py prepare --new-baseline`.

## 14. How this script was verified

On 6 Oct 2026 the whole journey was run on the real app (backend and frontend running, a phone-width
frame for the auditor, the sample photo path replaced by a generated image of the same size):
- Act 1: version history (Version 2 current with its note, Version 1 with 41 audits); editor and the
  "Review changes" summary.
- Act 2: coverage panel; clicking South City focuses the page.
- Act 3: the clash warning and refusal ("already booked at Select Citywalk (11:00)"); the real booking and its
  toast; the new row.
- Act 4: assigned audits with the manager's note; "Maximum is 2" blocking Next; the required-photo rule;
  offline answers ("Offline - 1 saved on device", server still at 2 answers) and the sync back (server at 4
  answers and the photo).
- Act 5: resume at the first unanswered question; the 2 flagged items; fixing them with the Review shortcut;
  submit (server: Submitted, 70 / 77, 90.91%, 21 answers, 1 photo, version 2).
- Act 6: ranking change (Ub City 77.9 to 90.9, first place), history and report drill-down.
- Reset: `python demo.py prepare` removed the run's audits and restored the staged state.
Not checked on a real phone: the camera itself, and the offline behaviour using a real network loss (the
rehearsal cut the connection inside the page, which exercises the same code).
