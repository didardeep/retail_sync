# Retail Sync: User Manual

How to use the Store Audit & Analysis tool, role by role, and the workflows to follow.

Checked against the running app on 12 Nov 2026. All logins below were tested and work.

---

## 1. Getting started

1. Open the app in a browser: **http://localhost:5173** (in development).
2. Sign in with your **username** (typed in the *Email* field) and password.
3. You land on the first page your role allows. The left sidebar shows only the pages you can use.
4. Sign out from the avatar menu in the top-right corner.

There is no self sign-up or "forgot password". The **Admin** creates accounts and resets passwords in
**User Management**.

---

## 2. Login IDs and passwords

The password for **every** account is: **`pass`**

> These are demo/test accounts. Change the passwords (User Management → Edit User → New Password)
> before the tool is used with real data.

### Admin and Audit Manager

| Username | Name | Role |
|---|---|---|
| `admin` | Admin | Admin |
| `manager` | Audit Manager | Audit Manager |

### Auditors

| Username | Name |
|---|---|
| `amit` | Amit Singh |
| `meera` | Meera Patel |
| `priya` | Priya Das |
| `rohit` | Rohit Sharma |
| `sara` | Sara Khan |

### Store Managers

| Username | Name | Stores they manage |
|---|---|---|
| `rao` | P. Rao | ST001 Phoenix Mall, ST008 Pacific Hub |
| `patel` | J. Patel | ST002 DLF Avenue, ST004 Select Citywalk, ST010 Orbit Mall |
| `singh` | N. Singh | ST003 Ub City, ST007 Elante Outpost |
| `das` | R. Das | ST005 Nexus Mall, ST009 South City |
| `sharma` | A. Sharma | ST006 Centra Mall |

### Auditees (store staff who fix issues)

| Username | Name | Linked stores |
|---|---|---|
| `karan` | Karan Bedi | Phoenix Mall, Ub City |
| `neha` | Neha Kapoor | DLF Avenue, Phoenix Mall |
| `divya` | Divya Nair | Nexus Mall, Select Citywalk |
| `rahul` | Rahul Mehta | Centra Mall, Elante Outpost |
| `pooja` | Pooja Iyer | Pacific Hub, South City |
| `vikram` | Vikram Joshi | Orbit Mall |

### Cluster Heads (one per region) and Head Office

| Username | Name | Role | Region |
|---|---|---|---|
| `anita` | Anita Verma | Cluster Head | North India |
| `arjun` | Arjun Sen | Cluster Head | East India |
| `ritu` | Ritu Malhotra | Cluster Head | West India |
| `suresh` | Suresh Menon | Cluster Head | South India |
| `nisha` | Nisha Gupta | HO Operations | All regions |

### Stores

| ID | Store | City | Region | Brand |
|---|---|---|---|---|
| ST001 | Phoenix Mall | Mumbai | West India | FreshMart |
| ST002 | DLF Avenue | Delhi | North India | Urban Basket |
| ST003 | Ub City | Bengaluru | South India | FreshMart |
| ST004 | Select Citywalk | Delhi | North India | Urban Basket |
| ST005 | Nexus Mall | Pune | West India | ValueHub |
| ST006 | Centra Mall | Chandigarh | North India | FreshMart |
| ST007 | Elante Outpost | Nagpur | West India | Metro Express |
| ST008 | Pacific Hub | Dehradun | North India | ValueHub |
| ST009 | South City | Kolkata | East India | Urban Basket |
| ST010 | Orbit Mall | Jaipur | North India | Metro Express |

---

## 3. Roles and access

### What each role is for

| Role | In one line |
|---|---|
| **Admin** | Everything the Audit Manager can do, plus creating and managing user accounts. |
| **Audit Manager** | Runs the audit programme: stores, questions, checklists, scheduling, approving audits, closing issues. |
| **Auditor** | Visits stores, fills in checklist audits, raises issues, fixes audits that are sent back. |
| **Store Manager** | Sees their own stores' results and issues, records actions taken, gives feedback on audits. |
| **Auditee** | Store staff member who receives issues, fixes them and replies with what was done. |
| **Cluster Head** | Read-only view of issues in their region; receives escalations of overdue critical issues. |
| **HO Operations** | Read-only view of issues in all stores; receives escalations of overdue critical issues. |

### Pages each role sees in the sidebar

| Page | Admin | Audit Mgr | Auditor | Store Mgr | Auditee | Cluster Head / HO |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Dashboard & Analytics | ✅ | ✅ | | | | |
| Dashboard (auditor's own) | | | ✅ | | | |
| My Store | | | | ✅ | | |
| My Issues | | | | | ✅ | |
| Audit Management | ✅ | ✅ | ✅ (own audits) | ✅ (own stores, read-only) | | |
| Pending Approval | ✅ | ✅ | | | | |
| Action Taken Tracking (issues) | ✅ | ✅ | ✅ (own audits) | ✅ (own stores) | | ✅ (read-only) |
| Store Audit Scores | ✅ | ✅ | | | | |
| Store Management | ✅ | ✅ | | | | |
| Audit Questions | ✅ | ✅ | | | | |
| Audit Log | ✅ | ✅ | | | | |
| User Management | ✅ | | | | | |
| Email Communications | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

Access is enforced by the server, not just hidden in the menu. Opening a page or record you
are not allowed to see is refused.

### What each role can do (actions)

| Action | Admin | Audit Mgr | Auditor | Store Mgr | Auditee | Cluster Head / HO |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Create / edit / deactivate users, reset passwords | ✅ | | | | | |
| Add / edit / dehire stores, onboard brands | ✅ | ✅ | | | | |
| Link auditors and auditees to stores | ✅ | ✅ | | | | |
| Add / edit questions, approve or reject proposed questions | ✅ | ✅ | | | | |
| Schedule, reschedule, reassign, cancel audits | ✅ | ✅ | | | | |
| Start an unscheduled audit on the spot | | | ✅ | | | |
| Answer questions, add remarks / risk / evidence | | | ✅ (own) | | | |
| Raise an issue on an answered question | ✅ | ✅ | ✅ (own) | | | |
| Submit an audit | | | ✅ (own) | | | |
| Review an audit: approve / send back / reject | ✅ | ✅ | | | | |
| Fix queried questions and resubmit | | | ✅ (own) | | | |
| Rate an audit (store manager feedback) | | | | ✅ | | |
| Reply to an issue with action taken, change its status | ✅ | ✅ | | ✅ | ✅ (own, cannot close) | |
| Accept or send back a resolved issue | ✅ | ✅ | ✅ (own audits) | | | |
| Approve & close or deny an issue's action taken | ✅ | ✅ | | | | |
| Delete an issue | ✅ | ✅ | | | | |
| View Audit Log | ✅ | ✅ | | | | |

---

## 4. The overall workflow

```
 SET UP            PLAN              DO                 REVIEW                 ACT
 Admin/AM          Audit Manager     Auditor            Audit Manager          Auditee / Store Mgr
 ─────────         ─────────────     ───────            ─────────────          ───────────────────
 users, stores, -> schedule audit -> answer questions -> approve, or       ->  fix issues, reply,
 brands, people,   (store, date,     add evidence,       send back for         mark Resolved
 questions,        auditor,          raise issues,       fixing, or reject       │
 checklists        checklists)       submit                 │                    ▼
                                                            ▼               Auditor accepts or
                                                     Auditor fixes &        sends back; AM approves
                                                     resubmits              & closes, or denies
```

### Audit statuses

| Status | Meaning | What happens next |
|---|---|---|
| **Planned** | Scheduled, not yet started. Date, auditor and notes can still be edited. | Auditor answers the first question → Ongoing |
| **Ongoing** | Auditor is filling it in. | Auditor submits → Completed |
| **Completed** | Submitted, waiting for the Audit Manager's review (shown in **Pending Approval**). | Approve → Approved; Send back → Changes Requested; Reject → Rejected |
| **Changes Requested** | Sent back. The auditor can change **only** the questions the manager ticked. | Auditor submits changes → Completed again |
| **Approved** | Final. The store manager and the store's auditees are notified. | — |
| **Rejected** | Final; the reason is recorded. | — |
| **Cancelled** | Will not happen; kept for the record, never deleted. | — |
| **Overdue** | (Filter, not a status) A Planned or Ongoing audit past its date. | — |

### Issue statuses

| Status | Set by | Meaning |
|---|---|---|
| **Open** | System on raising; also after a denial | Waiting for the assignee |
| **In Progress** | Assignee; also after the auditor sends it back | Being worked on |
| **On Hold** | Assignee / manager | Paused |
| **Resolved** | Assignee | Assignee says it is fixed, with the action taken |
| **Closed** | Audit Manager only (Approve & close) | Done |

### Scoring

- Each question has a **weight**. **Yes** earns the full weight, **Partial** half, **No** zero.
- **N/A** is left out entirely, so a store is not penalised for a question that does not apply.
- Score = earned ÷ possible × 100. It is calculated when the audit is submitted and feeds the
  store's quarterly score (Q1–Q4).

---

## 5. Workflows by role

### 5.1 Admin: set up users

**User Management → Add User**

1. Fill in **Name**, **Username** (what they log in with), **Password** (min 6 characters), **Role**,
   and optionally designation, phone and an **Alert email** (for reminders and escalations).
2. Role-specific fields:
   - **Store Manager** → *Assign Store*.
   - **Auditee** → tick the stores they are linked to. Only issues from these stores can be assigned to them.
   - **Cluster Head** → *Region*.
3. **Create User**.

To reset a password: **Edit User → New Password** (leave blank to keep the current one).
To block someone: **Deactivate**. They are locked out immediately. **Activate** to restore.
Note: the role cannot be changed after the account is created.

### 5.2 Audit Manager: set up stores and questions

**Onboard a brand and add stores (Store Management)**

1. **+ Add ▾ → Onboard a Brand** (name, legal name, short code, category, regions, contact) if the brand is new.
2. **+ Add ▾ → Add Store**: name, city, brand, region, format, type, status.
3. After saving, follow the **Next steps for this store**:
   1. **Assign an auditor**
   2. **Add an auditee**
   3. **Schedule an audit**
4. Use the **Without an auditor / Without an auditee** filters to find stores that are not fully set up.
5. A store that closes is **Dehired** (not deleted), so its history is kept.

**Maintain the question bank (Audit Questions)**

1. **+ New Question**: Process, Sub-Process, Type, question text, **Weight**, **Critical Risk** flag, tags.
2. **Edit** creates a new version. Finished audits keep the wording they were asked with.
3. **Deactivate** a question to stop using it (it is not hard-deleted).
4. Questions proposed by others appear as **Pending approval**. Choose **Approve**, or **Reject** with a
   reason. The person who proposed it sees the reason.

### 5.3 Audit Manager: schedule an audit

**Audit Management → + Schedule Audit**

1. **Store**. The store's linked auditors are suggested first.
2. **Audit type**: Checklist based Audit, Store Visit, Structured or Unstructured data analysis.
3. **Checklists**. Tick **one or more** checklists that apply to the store.
4. **Auditor**. You can also add a new auditor here with **+ Add auditor**.
5. **Start date / time** and **End date / time**.
6. **Notes**, for the objectives the auditor should see.
7. **Schedule**.

The tool **refuses** the booking, with the reason, if the auditor is on leave or already booked at
another store at that time.

Later changes (row **Actions** in Audit Management):

| Action | When allowed |
|---|---|
| **Reschedule / Edit** (date, auditor, notes) | Planned only |
| **Reassign** (new auditor, or remove the auditor) | Planned, Ongoing or Changes Requested. Answers already given stay; both auditors are notified. |
| **Cancel audit** | Planned. Stays in the list as Cancelled. |
| **Mark as** (status) | Completed / Approved only once every question is answered. |

### 5.4 Auditor: carry out an audit

**Find your work**

- **Dashboard** shows Scheduled, In progress, Submitted, Cancelled and Overdue counts, *Next up*,
  *Finish these* (drafts) and your numbers. Every number opens the matching list.
- **Audit Management** puts **Scheduled for you** at the top, overdue first. Use **Start** or **Resume**.
- For an unplanned visit: **New audit → choose a store → choose a checklist → Start**.

**Answer the questions**

1. One question per screen. Answer **Yes / Partial / No / N/A**.
2. Add **Remarks** ("What did you observe?"), a **Risk level**, and **Evidence** (photo or file).
   Questions marked **Critical** need extra care.
3. Use **Jump to section**, Previous / Next, and **Next flagged** to move around.
4. Answers save as you go. "Saved on this device" means they will sync when you are back online.

**Raise an issue on a question (optional, never automatic)**

1. On an answered question, open **Raise an issue for this question**.
2. Pick the **Priority** (e.g. Medium, Critical) and **Assign to**, one of the store's auditees.
3. **Raise issue**. This needs a connection and the answer must have synced first.

**Submit**

1. Go to **Review**. It lists what still blocks submitting and shows a **Score preview**.
   Submitting needs:
   - every question answered;
   - a **No** to have remarks (what was wrong) and evidence;
   - an **NA** to have remarks (why the question does not apply here);
   - every **annexure table** to have at least one value, unless the question is answered NA.
2. When nothing is left, **Submit audit** and confirm.
3. The result card shows the final score and the issues raised. The audit is now **Completed** and
   appears in the Audit Manager's **Pending Approval**.

**When an audit is sent back (Changes Requested)**

1. You get a notification. Open the audit: the **Changes requested** panel lists each ticked question
   with the manager's reason (e.g. *Wrong answer*, *Missing evidence*, *Unclear photo*).
2. Only those questions are unlocked. Others show *Locked: only the queried questions can be changed*.
3. Fix each one. The panel marks it **Changed**. When it says *Everything flagged was changed*,
   press **Submit changes**. The audit goes back to the manager.

**Review issues from your audits (Action Taken Tracking)**

When an auditee marks an issue **Resolved**, open it and either **Accept** (it stays Resolved for
the manager to close) or **Send back** with a reason (it reopens as In Progress). You can review an
issue once.

### 5.5 Audit Manager: review and approve audits

1. Open **Pending Approval**. It has two lists: *Waiting for review* (submitted) and *Returned to
   auditor* (out for fixing). Click **Review**.
2. The **Audit review** page shows every question with the answer, remarks, evidence and any issue raised.
   Filter the questions as needed.
3. Decide:
   - **Approve**: nothing ticked. The audit becomes **Approved** and the store manager and auditees are told.
   - **Send back for fixing**: tick the questions that need another look, give a reason for each
     (*What is wrong* / *Why should this be checked again?*) and say what the auditor should fix.
     The audit becomes **Changes Requested**.
   - **Reject audit**: give the reason. Final.
4. A resubmitted audit returns to *Waiting for review*, with the auditor's replies shown as
   **Fixed by auditor**.

### 5.6 Auditee: fix issues

1. Open **My Issues**. These are only the issues assigned to you.
2. Open an issue, write what you did in **Action taken**, attach evidence and set the status:
   **In Progress** while working, then **Resolved** when fixed.
3. You cannot close an issue. The auditor checks it, then the Audit Manager closes it.
   If it is sent back or denied, it reopens with the reason. Fix it and resolve it again.

### 5.7 Store Manager: follow up your stores

1. **My Store**: quarter score (Q1–Q4), score trend against the 90% benchmark, open issues by
   priority, audit results over time, recent audits and open issues. Every tile and chart opens the
   matching list.
2. **Audit Management**: read-only list of your stores' audits. Open one to view it and leave
   **Store manager feedback** (a rating and comment).
3. **Action Taken Tracking**: issues at your stores. Record the **Action taken** and update the status.

### 5.8 Audit Manager: close issues

1. **Action Taken Tracking** has a Table or Board view, tiles to filter by status, and filters for
   priority, store and assignee. **Export** downloads the list.
2. Open a **Resolved** issue and choose one:
   - **Approve & close**: the issue becomes **Closed**.
   - **Deny**: give a reason (and optional evidence). It goes back to **Open** and the assignee is told.
3. **+ New Issue** raises an issue by hand. Only auditees linked to the chosen store can be assigned.
   If a store has none, add one in Store Management first.
4. **Reassign**, **Edit Issue** and **Delete** (manager/admin only) are on each issue.

### 5.9 Cluster Head / HO Operations: monitor

Open **Action Taken Tracking**. A Cluster Head sees issues in their region and HO Operations sees all
stores. The view is read-only. You are alerted when a **Critical** issue goes overdue.

---

## 6. Notifications, reminders and escalations

The **bell** in the top bar shows your alerts. Alerts are also emailed when the server has email (SMTP)
configured and the user has an *Alert email*.

| When | Who is told |
|---|---|
| Audit scheduled within the next **2 days** | The auditor and the store manager |
| Audit reassigned | Old and new auditor |
| Audit sent back / approved | Auditor; on approval also store manager and auditees |
| Audit resubmitted after changes | The reviewing Audit Manager |
| Issue due within 2 days, then again once overdue | The assignee |
| Issue **overdue** | All Audit Managers (escalation) |
| **Critical** issue overdue | Also the region's Cluster Head and HO Operations |
| Issue action approved or denied | The assignee |

---

## 7. Dashboards and reports (Admin / Audit Manager)

| Page | Use it for |
|---|---|
| **Dashboard & Analytics** | Chain-wide overview: audits by status, store scores, risk, regions, score bands. Click any tile, slice or bar to open the list behind it. Choose a store at the top for that store's own view. |
| **Store Audit Scores** | Every store's Q1–Q4 scores; search, filter Operating/Dehired, export CSV, open a store's trend. |
| **Audit Log** | Who did what and when: scheduling, approvals, submissions, store, user and issue changes. |

---

## 8. Good-practice checklist

- Set up every store fully before scheduling: **auditor linked, auditee linked, checklist applicable**.
- Auditors: open the app online once before going to a store, and let answers sync before raising issues.
- Always write a clear reason when sending back, rejecting or denying. The other person sees it.
- Raise issues only for real follow-ups and give them to the right auditee with the right priority.
- Review **Pending Approval** and overdue issues regularly. Overdue items escalate automatically.

---

## 9. Known limitations

- **Email Communications** is a prototype. Nothing is actually sent or stored from that page.
- The **AI assistant** (round button) only works when a `GOOGLE_API_KEY` is configured on the server.
- There is no self-service password change. Ask the Admin.
- Some charts on the Dashboard Overview (e.g. the Power BI pop-up) are labelled as sample data.
