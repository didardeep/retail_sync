# Decision log: offline checklist audits (issue 9)

| Decision | Why | Alternatives |
|---|---|---|
| Offline scope is answers, risk and remarks only | Smallest slice that lets an auditor finish a store visit; photos need Blob storage and upload ordering | Also queue photos (bigger, later) |
| IndexedDB write first, then a per-question queue sent in seq order | Never lose a tap; one entry per question keeps replay small and idempotent | Send first and cache after (loses data when offline); full audit snapshot sync |
| Reuse the existing PUT answer endpoint, no bulk endpoint | PUT sets values, so replays are safe; volume is small | New bulk upload endpoint |
| Device wins for the auditor's own open audit; if the server says submitted or closed, keep the local copy and show a conflict until dismissed | Only the auditor edits it, so overwriting is safe; a closed audit must not be changed silently | Server wins; field-level merge |
| Submit needs every answer synced and a connection | The score is computed on the server from stored answers | Queue the submit (risks submitting stale data) |
| Evidence link and Raise issue disabled offline | They need the server (issue assignee list, uploads); disabling avoids silent loss | Queue issues |
| Hand-written minimal service worker, production only | No PWA exists; avoids a plugin dependency | vite-plugin-pwa / workbox |
