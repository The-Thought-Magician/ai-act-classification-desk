# AI Act Classification Desk — Build Plan (Authoritative Contract)

This is the single source of truth. Every filename, mount path, api method name, and page file declared here is binding. The schema is `backend/src/db/schema.ts`; the self-provisioning DDL is `backend/src/db/migrate.ts`.

Stack (from `_template-report.md`): Hono 4.12.27 backend, drizzle-orm 0.45.2 + @neondatabase/serverless, Next.js ^16.2.9 + React ^19 + Tailwind 4, auth `@neondatabase/auth@0.4.2-beta`. Backend trusts `X-User-Id`; use `getUserId(c)` everywhere. Routes mount under `/api/v1` via a child Hono `api` router. Every route file `export default router`. Public reads / auth-gated writes with zod + ownership checks. Frontend calls `fetch('/api/proxy/<path>')` 1:1 to `/api/v1/<path>`. `web/proxy.ts` only (no middleware.ts). Auth pages use client `onSubmit` + `authClient`. Landing is static.

---

## (a) Tables (columns)

| Table | Key columns |
|-------|-------------|
| `ai_systems` | id, user_id, name, description, role, intended_purpose, purpose_category, modality, geographies(jsonb), placed_on_eu_market(bool), lifecycle_stage, is_gpai(bool), is_systemic_risk(bool), status, current_tier, tags(jsonb), archived(bool), created_at, updated_at |
| `system_versions` | id, system_id→ai_systems, snapshot(jsonb), created_by, created_at |
| `classifications` | id, system_id→ai_systems, tier, ruleset_version, rationale(jsonb), coverage_pct(real), is_override(bool), override_justification, created_by, created_at |
| `rule_hits` | id, classification_id→classifications, rule_code, article_ref, question, answer, contributes_to_tier, created_at |
| `classification_answers` | id, system_id→ai_systems, classification_id→classifications, question_key, answer(jsonb), created_at |
| `obligations` | id, system_id→ai_systems, user_id, tier, article_ref, title, description, applicability_reason, template_code, owner, due_date, status, evidence_links(jsonb), created_at, updated_at |
| `evidence_requirements` | id, system_id→ai_systems, user_id, requirement_code, category, title, description, required(bool), status, artifact_url, artifact_meta(jsonb), reviewer, notes, created_at, updated_at |
| `evidence_artifacts` | id, user_id, name, url, meta(jsonb), created_at |
| `transparency_notices` | id, system_id→ai_systems, user_id, trigger_code, locale, version(int), body, body_html, published(bool), created_by, created_at |
| `registry_packages` | id, system_id→ai_systems UNIQUE, user_id, fields(jsonb), status, readiness_pct(real), blocking_reasons(jsonb), registered_reference, version(int), created_at, updated_at |
| `role_events` | id, system_id→ai_systems, user_id, event_type, description, before_role, after_role, flipped(bool), created_by, created_at |
| `deadlines` | id, system_id→ai_systems, user_id, label, due_date, source, status, created_at |
| `tags` | id, user_id, name, color, created_at; UNIQUE(user_id,name) |
| `saved_filters` | id, user_id, name, scope, criteria(jsonb), created_at |
| `notifications` | id, user_id, type, title, body, entity_type, entity_id, read(bool), created_at |
| `webhooks` | id, user_id, url, events(jsonb), secret, active(bool), created_at |
| `webhook_deliveries` | id, webhook_id→webhooks, event, payload(jsonb), status_code(int), ok(bool), created_at |
| `api_keys` | id, user_id, name, prefix, hashed_secret, last_used_at, created_at |
| `audit_log` | id, user_id, action, entity_type, entity_id, summary, meta(jsonb), created_at |
| `onboarding_progress` | id, user_id UNIQUE, steps(jsonb), dismissed(bool), created_at, updated_at |
| `plans` | id(text 'free'/'pro'), name, price_cents(int), created_at |
| `subscriptions` | id, user_id UNIQUE, plan_id→plans, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at |

---

## (b) Backend route files

All mount under `/api/v1` via the child `api` router in `src/index.ts`. Auth column: ✗ = public read, ✓ = requires `authMiddleware` + ownership check.

### `systems.ts` → mount `/systems`
- `GET /` — ✗ — list current user's systems (filter: tier, status, archived, tag) — `AiSystem[]`
- `GET /:id` — ✗ — system detail — `AiSystem`
- `POST /` — ✓ — create system (zod) — `AiSystem`
- `PUT /:id` — ✓ — update system — `AiSystem`
- `DELETE /:id` — ✓ — delete system — `{ success }`
- `POST /:id/archive` — ✓ — archive/restore (body `{archived}`) — `AiSystem`
- `GET /:id/versions` — ✗ — intake snapshots — `SystemVersion[]`
- `GET /:id/activity` — ✗ — per-system activity timeline (audit_log filtered) — `AuditEntry[]`

### `classify.ts` → mount `/classify`
- `GET /questionnaire` — ✗ — current questionnaire definition (from rules engine) — `{ ruleset_version, questions[] }`
- `GET /:systemId` — ✗ — latest classification + rule_hits for a system — `{ classification, rule_hits[] }`
- `GET /:systemId/history` — ✗ — classification history — `Classification[]`
- `POST /:systemId/run` — ✓ — run deterministic classifier from answers (body `{answers}`); writes classification + rule_hits + answers; updates system.current_tier; regenerates obligations + evidence reqs; emits notification/webhook — `{ classification, rule_hits[] }`
- `POST /:systemId/override` — ✓ — manual tier override with justification — `Classification`

### `obligations.ts` → mount `/obligations`
- `GET /` — ✗ — all obligations for user (filters: system_id, tier, article, status, owner, due) — `Obligation[]`
- `GET /system/:systemId` — ✗ — obligations for one system — `Obligation[]`
- `POST /system/:systemId/regenerate` — ✓ — regenerate from current tier/role (preserve status where persists) — `Obligation[]`
- `PUT /:id` — ✓ — update obligation (status, owner, due_date, evidence_links) — `Obligation`

### `evidence.ts` → mount `/evidence`
- `GET /` — ✗ — all evidence requirements for user (filters: status, category, reviewer, system_id) — `EvidenceRequirement[]`
- `GET /system/:systemId` — ✗ — requirements + readiness for one system — `{ requirements[], readiness_pct, gap_count }`
- `PUT /requirement/:id` — ✓ — update requirement (status, artifact_url, reviewer, notes) — `EvidenceRequirement`
- `GET /artifacts` — ✗ — reusable artifacts — `EvidenceArtifact[]`
- `POST /artifacts` — ✓ — create artifact — `EvidenceArtifact`
- `DELETE /artifacts/:id` — ✓ — delete artifact — `{ success }`

### `notices.ts` → mount `/notices`
- `GET /` — ✗ — all notices for user (filter system_id) — `TransparencyNotice[]`
- `GET /:id` — ✗ — notice detail — `TransparencyNotice`
- `POST /` — ✓ — create notice from template + tokens (new version) — `TransparencyNotice`
- `PUT /:id` — ✓ — edit notice (creates next version) — `TransparencyNotice`
- `POST /:id/publish` — ✓ — publish/unpublish (body `{published}`) — `TransparencyNotice`
- `GET /templates/list` — ✗ — available notice templates per trigger — `Template[]`

### `registry.ts` → mount `/registry`
- `GET /` — ✗ — all registry packages for user — `RegistryPackage[]`
- `GET /system/:systemId` — ✗ — package for a system (auto-create draft if absent) — `RegistryPackage`
- `PUT /system/:systemId` — ✓ — update package fields; recompute readiness + blocking_reasons — `RegistryPackage`
- `POST /system/:systemId/submit` — ✓ — submission-readiness gate; sets status ready/submitted if all pass — `RegistryPackage`

### `roles.ts` → mount `/roles`
- `GET /system/:systemId` — ✗ — role-change log for a system — `RoleEvent[]`
- `GET /` — ✗ — all role events for user — `RoleEvent[]`
- `POST /system/:systemId` — ✓ — record role-event; re-derive effective role; flag flip; regenerate obligations on flip — `{ role_event, flipped, system }`

### `dashboard.ts` → mount `/dashboard`
- `GET /summary` — ✗ — portfolio summary (tier counts, obligation completion %, evidence gaps, registry status counts, upcoming deadlines, recent classifications, recent role flips) — `DashboardSummary`

### `deadlines.ts` → mount `/deadlines`
- `GET /` — ✗ — aggregated deadlines (obligations + registry + custom; buckets due-soon/overdue) — `{ overdue[], due_soon[], upcoming[] }`
- `POST /` — ✓ — create custom deadline — `Deadline`
- `DELETE /:id` — ✓ — delete custom deadline — `{ success }`

### `analytics.ts` → mount `/analytics`
- `GET /overview` — ✗ — tier distribution, readiness %, top blocking requirements — `AnalyticsOverview`
- `GET /trends` — ✗ — readiness trend, classifications-per-week, obligation burndown, evidence-gap trend — `AnalyticsTrends`

### `search.ts` → mount `/search`
- `GET /` — ✗ — global search across systems/obligations/evidence/notices/registry (query `q`) — `{ results: TypedResult[] }`

### `tags.ts` → mount `/tags`
- `GET /` — ✗ — user tags — `Tag[]`
- `POST /` — ✓ — create tag — `Tag`
- `DELETE /:id` — ✓ — delete tag — `{ success }`
- `POST /assign` — ✓ — set tags on a system (body `{system_id, tags}`) — `AiSystem`

### `filters.ts` → mount `/filters`
- `GET /` — ✗ — saved filters — `SavedFilter[]`
- `POST /` — ✓ — create saved filter — `SavedFilter`
- `DELETE /:id` — ✓ — delete saved filter — `{ success }`

### `bulk.ts` → mount `/bulk`
- `POST /reclassify` — ✓ — bulk re-run classifier on system ids (body `{ids, answers?}`) — `{ updated: number }`
- `POST /systems` — ✓ — bulk set owner/status on systems (body `{ids, patch}`) — `{ updated: number }`
- `POST /obligations` — ✓ — bulk update obligation status (body `{ids, status}`) — `{ updated: number }`

### `notifications.ts` → mount `/notifications`
- `GET /` — ✗ — user notifications (+ unread count) — `{ notifications[], unread }`
- `POST /:id/read` — ✓ — mark one read — `Notification`
- `POST /read-all` — ✓ — mark all read — `{ success }`

### `webhooks.ts` → mount `/webhooks`
- `GET /` — ✗ — user webhooks — `Webhook[]`
- `POST /` — ✓ — create webhook — `Webhook`
- `PUT /:id` — ✓ — update webhook (events, url, active) — `Webhook`
- `DELETE /:id` — ✓ — delete webhook — `{ success }`
- `GET /:id/deliveries` — ✗ — delivery log — `WebhookDelivery[]`
- `POST /:id/test` — ✓ — send a test delivery — `WebhookDelivery`

### `apiKeys.ts` → mount `/api-keys`
- `GET /` — ✗ — user keys (no secret) — `ApiKey[]`
- `POST /` — ✓ — create key (returns plaintext secret once) — `{ key, secret }`
- `DELETE /:id` — ✓ — revoke key — `{ success }`

### `audit.ts` → mount `/audit`
- `GET /` — ✗ — audit log for user (filters: action, entity_type, date) — `AuditEntry[]`

### `settings.ts` → mount `/settings`
- `GET /` — ✗ — user settings (org name, jurisdiction defaults, notification prefs) — `Settings`
- `PUT /` — ✓ — update settings — `Settings`
- `POST /reset-demo` — ✓ — re-seed/reset this user's sample data — `{ success }`

### `onboarding.ts` → mount `/onboarding`
- `GET /` — ✗ — onboarding progress for user (auto-create) — `OnboardingProgress`
- `PUT /` — ✓ — update steps / dismissed — `OnboardingProgress`

### `rulesets.ts` → mount `/rulesets`
- `GET /current` — ✗ — current rule-set metadata (version, prohibited list, Annex III categories, Art 50 triggers) — `Ruleset`

### `billing.ts` → mount `/billing`
- `GET /plan` — ✗ — subscription + plan + `stripeEnabled` (auto-create free sub) — `{ subscription, plan, stripeEnabled }`
- `POST /checkout` — ✗ — Stripe checkout or `503` — `{ url }`
- `POST /portal` — ✗ — Stripe portal or `503` — `{ url }`
- `POST /webhook` — ✗ — Stripe webhook or `503` — `{ received }`

Total route files: **22** — systems, classify, obligations, evidence, notices, registry, roles, dashboard, deadlines, analytics, search, tags, filters, bulk, notifications, webhooks, apiKeys, audit, settings, onboarding, rulesets, billing. (`health` is served inline in `index.ts`, not a mounted route file.)

---

## (c) `web/lib/api.ts` methods

Each method is `fetch('/api/proxy/<path>')` mapping 1:1 to `/api/v1/<path>`. Mutations send `Content-Type: application/json` + `JSON.stringify`. Export `default`.

| Method | Verb | Proxy path |
|--------|------|-----------|
| `listSystems(params?)` | GET | `/api/proxy/systems` |
| `getSystem(id)` | GET | `/api/proxy/systems/${id}` |
| `createSystem(body)` | POST | `/api/proxy/systems` |
| `updateSystem(id, body)` | PUT | `/api/proxy/systems/${id}` |
| `deleteSystem(id)` | DELETE | `/api/proxy/systems/${id}` |
| `archiveSystem(id, archived)` | POST | `/api/proxy/systems/${id}/archive` |
| `getSystemVersions(id)` | GET | `/api/proxy/systems/${id}/versions` |
| `getSystemActivity(id)` | GET | `/api/proxy/systems/${id}/activity` |
| `getQuestionnaire()` | GET | `/api/proxy/classify/questionnaire` |
| `getClassification(systemId)` | GET | `/api/proxy/classify/${systemId}` |
| `getClassificationHistory(systemId)` | GET | `/api/proxy/classify/${systemId}/history` |
| `runClassification(systemId, answers)` | POST | `/api/proxy/classify/${systemId}/run` |
| `overrideClassification(systemId, body)` | POST | `/api/proxy/classify/${systemId}/override` |
| `listObligations(params?)` | GET | `/api/proxy/obligations` |
| `getSystemObligations(systemId)` | GET | `/api/proxy/obligations/system/${systemId}` |
| `regenerateObligations(systemId)` | POST | `/api/proxy/obligations/system/${systemId}/regenerate` |
| `updateObligation(id, body)` | PUT | `/api/proxy/obligations/${id}` |
| `listEvidence(params?)` | GET | `/api/proxy/evidence` |
| `getSystemEvidence(systemId)` | GET | `/api/proxy/evidence/system/${systemId}` |
| `updateEvidenceRequirement(id, body)` | PUT | `/api/proxy/evidence/requirement/${id}` |
| `listArtifacts()` | GET | `/api/proxy/evidence/artifacts` |
| `createArtifact(body)` | POST | `/api/proxy/evidence/artifacts` |
| `deleteArtifact(id)` | DELETE | `/api/proxy/evidence/artifacts/${id}` |
| `listNotices(params?)` | GET | `/api/proxy/notices` |
| `getNotice(id)` | GET | `/api/proxy/notices/${id}` |
| `createNotice(body)` | POST | `/api/proxy/notices` |
| `updateNotice(id, body)` | PUT | `/api/proxy/notices/${id}` |
| `publishNotice(id, published)` | POST | `/api/proxy/notices/${id}/publish` |
| `listNoticeTemplates()` | GET | `/api/proxy/notices/templates/list` |
| `listRegistryPackages()` | GET | `/api/proxy/registry` |
| `getRegistryPackage(systemId)` | GET | `/api/proxy/registry/system/${systemId}` |
| `updateRegistryPackage(systemId, body)` | PUT | `/api/proxy/registry/system/${systemId}` |
| `submitRegistryPackage(systemId)` | POST | `/api/proxy/registry/system/${systemId}/submit` |
| `getSystemRoleEvents(systemId)` | GET | `/api/proxy/roles/system/${systemId}` |
| `listRoleEvents()` | GET | `/api/proxy/roles` |
| `createRoleEvent(systemId, body)` | POST | `/api/proxy/roles/system/${systemId}` |
| `getDashboardSummary()` | GET | `/api/proxy/dashboard/summary` |
| `getDeadlines()` | GET | `/api/proxy/deadlines` |
| `createDeadline(body)` | POST | `/api/proxy/deadlines` |
| `deleteDeadline(id)` | DELETE | `/api/proxy/deadlines/${id}` |
| `getAnalyticsOverview()` | GET | `/api/proxy/analytics/overview` |
| `getAnalyticsTrends()` | GET | `/api/proxy/analytics/trends` |
| `search(q)` | GET | `/api/proxy/search?q=${q}` |
| `listTags()` | GET | `/api/proxy/tags` |
| `createTag(body)` | POST | `/api/proxy/tags` |
| `deleteTag(id)` | DELETE | `/api/proxy/tags/${id}` |
| `assignTags(body)` | POST | `/api/proxy/tags/assign` |
| `listFilters()` | GET | `/api/proxy/filters` |
| `createFilter(body)` | POST | `/api/proxy/filters` |
| `deleteFilter(id)` | DELETE | `/api/proxy/filters/${id}` |
| `bulkReclassify(body)` | POST | `/api/proxy/bulk/reclassify` |
| `bulkUpdateSystems(body)` | POST | `/api/proxy/bulk/systems` |
| `bulkUpdateObligations(body)` | POST | `/api/proxy/bulk/obligations` |
| `listNotifications()` | GET | `/api/proxy/notifications` |
| `markNotificationRead(id)` | POST | `/api/proxy/notifications/${id}/read` |
| `markAllNotificationsRead()` | POST | `/api/proxy/notifications/read-all` |
| `listWebhooks()` | GET | `/api/proxy/webhooks` |
| `createWebhook(body)` | POST | `/api/proxy/webhooks` |
| `updateWebhook(id, body)` | PUT | `/api/proxy/webhooks/${id}` |
| `deleteWebhook(id)` | DELETE | `/api/proxy/webhooks/${id}` |
| `getWebhookDeliveries(id)` | GET | `/api/proxy/webhooks/${id}/deliveries` |
| `testWebhook(id)` | POST | `/api/proxy/webhooks/${id}/test` |
| `listApiKeys()` | GET | `/api/proxy/api-keys` |
| `createApiKey(body)` | POST | `/api/proxy/api-keys` |
| `deleteApiKey(id)` | DELETE | `/api/proxy/api-keys/${id}` |
| `getAuditLog(params?)` | GET | `/api/proxy/audit` |
| `getSettings()` | GET | `/api/proxy/settings` |
| `updateSettings(body)` | PUT | `/api/proxy/settings` |
| `resetDemo()` | POST | `/api/proxy/settings/reset-demo` |
| `getOnboarding()` | GET | `/api/proxy/onboarding` |
| `updateOnboarding(body)` | PUT | `/api/proxy/onboarding` |
| `getRuleset()` | GET | `/api/proxy/rulesets/current` |
| `getBillingPlan()` | GET | `/api/proxy/billing/plan` |
| `startCheckout()` | POST | `/api/proxy/billing/checkout` |
| `openPortal()` | POST | `/api/proxy/billing/portal` |

---

## (d) Pages

Public pages:

| Route | File | Kind | Uses (api) | Renders |
|-------|------|------|-----------|---------|
| `/` | `web/app/page.tsx` | public | (none) | Static landing: hero, EU-AI-Act value prop, feature grid, CTAs |
| `/auth/sign-in` | `web/app/auth/sign-in/page.tsx` | public | authClient | Client onSubmit sign-in |
| `/auth/sign-up` | `web/app/auth/sign-up/page.tsx` | public | authClient | Client onSubmit sign-up |
| `/pricing` | `web/app/pricing/page.tsx` | public | getBillingPlan, startCheckout | Free + Pro plans; checkout (503-aware) |

Dashboard pages (wrapped by `web/app/dashboard/layout.tsx` → `DashboardLayout` sidebar):

| Route | File | Kind | Uses (api) | Renders |
|-------|------|------|-----------|---------|
| `/dashboard` | `web/app/dashboard/page.tsx` | dashboard | getDashboardSummary, getDeadlines | Portfolio overview: tier counts, completion %, gaps, registry status, upcoming deadlines, recent activity |
| `/dashboard/systems` | `web/app/dashboard/systems/page.tsx` | dashboard | listSystems, listTags, listFilters, archiveSystem, bulkUpdateSystems, bulkReclassify | System register list + filters + bulk actions |
| `/dashboard/systems/new` | `web/app/dashboard/systems/new/page.tsx` | dashboard | createSystem, listTags | Intake form |
| `/dashboard/systems/[id]` | `web/app/dashboard/systems/[id]/page.tsx` | dashboard | getSystem, getClassification, getSystemObligations, getSystemEvidence, getRegistryPackage, getSystemRoleEvents, getSystemVersions, getSystemActivity, updateSystem, assignTags | System detail: tabs for classification, obligations, evidence, registry, roles, versions/activity |
| `/dashboard/systems/[id]/classify` | `web/app/dashboard/systems/[id]/classify/page.tsx` | dashboard | getQuestionnaire, getClassification, getClassificationHistory, runClassification, overrideClassification | Run questionnaire, show tier + cited rule hits, override |
| `/dashboard/obligations` | `web/app/dashboard/obligations/page.tsx` | dashboard | listObligations, updateObligation, bulkUpdateObligations | Obligations registry: filters, inline status, bulk |
| `/dashboard/evidence` | `web/app/dashboard/evidence/page.tsx` | dashboard | listEvidence, updateEvidenceRequirement, listArtifacts, createArtifact, deleteArtifact | Evidence registry + artifacts |
| `/dashboard/notices` | `web/app/dashboard/notices/page.tsx` | dashboard | listNotices, getNotice, createNotice, updateNotice, publishNotice, listNoticeTemplates, listSystems | Transparency notices list + builder + preview |
| `/dashboard/registry` | `web/app/dashboard/registry/page.tsx` | dashboard | listRegistryPackages, getRegistryPackage, updateRegistryPackage, submitRegistryPackage | Registry packages list + readiness + submit gate |
| `/dashboard/roles` | `web/app/dashboard/roles/page.tsx` | dashboard | listRoleEvents, createRoleEvent, listSystems | Role events / role-change log |
| `/dashboard/deadlines` | `web/app/dashboard/deadlines/page.tsx` | dashboard | getDeadlines, createDeadline, deleteDeadline | Deadlines & calendar (overdue / due-soon / upcoming) |
| `/dashboard/analytics` | `web/app/dashboard/analytics/page.tsx` | dashboard | getAnalyticsOverview, getAnalyticsTrends | Analytics charts |
| `/dashboard/search` | `web/app/dashboard/search/page.tsx` | dashboard | search | Global search results |
| `/dashboard/tags` | `web/app/dashboard/tags/page.tsx` | dashboard | listTags, createTag, deleteTag, listFilters, createFilter, deleteFilter | Tags & saved filters |
| `/dashboard/notifications` | `web/app/dashboard/notifications/page.tsx` | dashboard | listNotifications, markNotificationRead, markAllNotificationsRead | Notifications |
| `/dashboard/webhooks` | `web/app/dashboard/webhooks/page.tsx` | dashboard | listWebhooks, createWebhook, updateWebhook, deleteWebhook, getWebhookDeliveries, testWebhook | Webhooks + delivery log |
| `/dashboard/api-keys` | `web/app/dashboard/api-keys/page.tsx` | dashboard | listApiKeys, createApiKey, deleteApiKey, getRuleset | API keys + API docs (ruleset/read endpoints) |
| `/dashboard/audit` | `web/app/dashboard/audit/page.tsx` | dashboard | getAuditLog | Audit log |
| `/dashboard/settings` | `web/app/dashboard/settings/page.tsx` | dashboard | getSettings, updateSettings, resetDemo, getBillingPlan | Settings + billing summary + reset demo |
| `/dashboard/onboarding` | `web/app/dashboard/onboarding/page.tsx` | dashboard | getOnboarding, updateOnboarding, getDashboardSummary | Onboarding wizard checklist |

Total pages: **4 public + 21 dashboard = 25** `page.tsx` files. Plus 2 route handlers: `web/app/api/auth/[...path]/route.ts`, `web/app/api/proxy/[...path]/route.ts`.

---

## (e) DashboardLayout sidebar nav

`web/components/DashboardLayout.tsx` — `'use client'`, `<aside>` sidebar, active state via `usePathname()`, mobile drawer. Grouped sections:

- **Overview**
  - Dashboard → `/dashboard`
  - Analytics → `/dashboard/analytics`
- **Systems**
  - AI Systems → `/dashboard/systems`
  - New System → `/dashboard/systems/new`
  - Search → `/dashboard/search`
- **Compliance**
  - Obligations → `/dashboard/obligations`
  - Evidence → `/dashboard/evidence`
  - Transparency Notices → `/dashboard/notices`
  - Registry Packages → `/dashboard/registry`
  - Role Changes → `/dashboard/roles`
  - Deadlines → `/dashboard/deadlines`
- **Workspace**
  - Tags & Filters → `/dashboard/tags`
  - Notifications → `/dashboard/notifications`
  - Audit Log → `/dashboard/audit`
- **Developer**
  - Webhooks → `/dashboard/webhooks`
  - API Keys → `/dashboard/api-keys`
- **Account**
  - Onboarding → `/dashboard/onboarding`
  - Settings → `/dashboard/settings`

---

## Consistency notes (binding)

- Every api method in (c) maps to exactly one endpoint in (b); every page in (d) consumes at least one api method; every write endpoint is auth-gated with an ownership check via `getUserId(c)`.
- The classifier (`classify.ts` POST `/run`) is the deterministic engine: it walks the Article 5 prohibited list, Annex III high-risk categories, Article 6(3) derogation, and Article 50 triggers, writing cited `rule_hits` and a `rationale` array, then cascades to regenerate `obligations` + `evidence_requirements` and recompute `registry_packages.readiness_pct`.
- `index.ts` runs `migrate()` then `seedIfEmpty()` (the 5-system sample set from idea.md §23) at boot.
- Billing uses the full Stripe-optional-503 pattern with text `plan_id` ('free'/'pro') matching `subscriptions`/`plans`. Add `stripe` dep.
