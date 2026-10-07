# URL Contract

Every cross-page link is built in `frontend/src/lib/links.js`. Pages read their own query keys; nobody else hard-codes these URLs. Empty values are never put in a URL.

| Route | Query keys | Read by | Builder |
|---|---|---|---|
| `/audits` | `stage` (exact stage or `overdue`), `status` (`scheduled`, `in_progress`, `completed` which includes approved, `cancelled`, `overdue`, or old raw statuses `Planned`, `Draft`, `Submitted`), `view` (`assigned`/`scheduled`, `in_progress`), `tool` (SOP tool code), `kind`, `store`, `region`, `auditor`, `q`, `id` | Audit page (the one page for every role) | `auditsLink`, `sopAuditsLink` |
| `/scheduling` | `stage`, `auditor`, `id`, `new` (e.g. `sop`) | Audit Scheduling page | `schedulingLink` |
| `/issues` | `status`, `priority`, `store`, `audit`, `sop_audit`, `id` | Action Taken Tracking page | `issuesLink` |
| `/stores` | `region`, `format`, `id` | Store Management page | `storesLink` |
| `/sop-audits` | any | Redirects to `/audits` keeping the query (old bookmarks, bell, dashboard links) | `auditListRedirectTarget` |
| `/sop-audits/:id` | none | SOP audit wizard (guarded by the `audits` page key) | `sopAuditRunLink` |
| `/sop-audits/:id/review` | none | SOP audit review page | `sopAuditReviewLink` |
| `/dashboard` | `tab=sop`, `store`, `tool`, `section`, `criterion` (SOP tab also uses `region`, `q`) | Dashboard page (`tab`) and SOP dashboard (filters) | `sopDashboardLink` |
| `/dashboard` | `store` (without `tab=sop`) | Dashboard store view (store selector; "All stores" when absent). With `tab=sop` the `store` key is the SOP tab's own filter | `storeScorecardLink` |
| `/my-store` | `store` | Store managers: own store page (ignores `store`). ADMIN and AUDIT_MANAGER are redirected to `/dashboard` keeping `?store` | none |
| `/questions` | `tab` (e.g. `sop-tools`) | Audit Questions page | `questionsLink` |
| `/questions/sop-tools/:code` | none | SOP tool editor (manager only) | `sopToolEditorLink` |

Other helpers in `links.js`:

- `storeScorecardLink(storeId, role)`: ADMIN and AUDIT_MANAGER go to the Dashboard store view (`/dashboard?store=<id>`); every other role goes to their SOP audit list for the store.
- `entityLink(entityType, entityId)`: maps an audit-log `entity_type` to a page (`store`, `audit`, `issue`, `sop_audit`, `question`); returns `null` for types with no page (`data_import`, `sop_criterion`, unknown types).

Filters that live in the URL are read with `useUrlFilters` (`frontend/src/lib/useUrlFilters.js`).

## Rollout note

Links into `/audits` and `/scheduling` can already be generated, but their query parameters only start taking effect when the scheduling stream lands. Until then those pages ignore the parameters and show their unfiltered view.
