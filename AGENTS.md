# AllMed HRMS — Project Notes

## Permissions model

Authorization is direct per-user: `users/{uid}.permissions` is the only module/action
source. `roleId`/designation are identity + administrative + branch-scope metadata only.
`firestore.rules`, `functions/src/permissions.ts`, and `src/permissions/hasPermission.ts`
must stay consistent. Migration script: `functions/scripts/migrate-rbac.js`
(`--dry-run` supported; idempotent via `permissionMigrationVersion: 1`).

## Known security debt (tracked, pre-existing — not rollout blockers)

1. **`whatsapp_conversations` / `whatsapp_messages` rules are permissive** —
   `firestore.rules` allows any authenticated user read+write on both collections.
   Tighten to permission-gated (e.g. `dms.whatsappMessenger`) when prioritized.
2. **Webhook POST lacks `X-Hub-Signature-256` verification** —
   `functions/src/webhook.ts` verifies the GET handshake via `hub.verify_token` but
   does not validate the POST body signature. Add HMAC verification against the Meta
   app secret when prioritized.

## Infrastructure debt

- `functions/package.json` pins `firebase-functions@4.9.0` — upgrade to >=5.1.0
  (breaking changes; needed for newest Extensions features).
- `functions.config()` / Runtime Config API deprecated — migrate to `params`
  before March 2027 (`firebase functions:config:export` to start).
- Frontend bundle ~2.5 MB exceeds PWA precache limit — code-split if PWA caching
  matters.
