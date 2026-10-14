# AllMed HRMS — Project Notes

## Permissions model

Authorization is direct per-user: `users/{uid}.permissions` is the only module/action
source. `roleId`/designation are identity + administrative + branch-scope metadata only.
`firestore.rules`, `functions/src/permissions.ts`, and `src/permissions/hasPermission.ts`
must stay consistent. Migration script: `functions/scripts/migrate-rbac.js`
(`--dry-run` supported; idempotent via `permissionMigrationVersion: 1`).

## WhatsApp security (addressed — pending production deploy)

- `whatsapp_conversations`: reads stay authenticated; updates require
  `dms.whatsappMessenger` access and may only touch read-receipt /
  delivery-status fields; create/delete denied (server writes use Admin SDK).
- `whatsapp_messages`: read-only for clients; all writes via Admin SDK.
- Webhook POST validates Meta `X-Hub-Signature-256` (HMAC-SHA256 over the raw
  body, `WHATSAPP_APP_SECRET` env var; fail-closed). **Deploy requires
  `WHATSAPP_APP_SECRET` set on the `webhook` function env vars first** —
  without it, inbound Meta events are rejected.

## Infrastructure debt

- `firebase-functions@4.9.0` — plan: upgrade to >=5.1.0. Breaking changes
  (v2-first APIs, dropped Node <16, config removal path). Steps: bump in
  `functions/package.json`, `npm install`, fix compile errors, run all tests,
  then `firebase deploy --only functions`. Note the secret/env config still
  works via process.env today.
- `functions.config()` / Runtime Config API deprecated — migrate to `params`
  before March 2027 (`firebase functions:config:export` to start).
- Frontend bundle ~2.5 MB exceeds PWA precache limit — code-split if PWA caching
  matters.
