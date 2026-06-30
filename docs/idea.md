# AI Act Classification Desk

> Classify every AI system into its EU AI Act risk tier and generate the obligation checklist, conformity evidence, and registration package.

---

## Overview

AI Act Classification Desk is a governance workbench that turns the EU AI Act from a 100-page legal text into an operational, system-by-system compliance engine. A company registers each AI system it builds, buys, or deploys; the platform walks a deterministic rules questionnaire derived from the Act's Annex III high-risk categories and Article 5 prohibited-practice list; and it outputs a defensible risk-tier classification (prohibited / high / limited / minimal) with a cited rationale for every rule that fired. From that classification it derives the tier-specific statutory obligation checklist, tracks the Annex IV technical-documentation evidence with a readiness score, assembles the EU high-risk registration package, and generates versioned transparency notices for limited-risk systems. A role-reasoning engine watches for substantial modifications and fine-tunes that flip a deployer into a provider and re-derives obligations automatically.

The product is deterministic by design: the same intake answers always produce the same tier and the same obligations, every rule hit is traceable to an Act article, and nothing depends on a probabilistic model. This is what makes the output legally defensible.

## Problem

Companies deploying AI into the EU market face three compounding problems:

1. **They cannot reliably classify each system's risk tier.** The Act's risk taxonomy lives across Article 5 (prohibited), Annex III (high-risk use-cases), Article 50 (transparency obligations for limited-risk), and a web of recitals and exemptions. Mapping a real product to a tier requires reading legal text and reasoning about edge cases (e.g. an Annex III system that does not pose significant risk under Article 6(3)).
2. **They cannot produce the tier-specific statutory obligations.** High-risk systems trigger risk management (Art 9), data governance (Art 10), technical documentation (Art 11 + Annex IV), record-keeping/logging (Art 12), transparency to deployers (Art 13), human oversight (Art 14), and accuracy/robustness/cybersecurity (Art 15). Limited-risk systems trigger Article 50 transparency. Knowing exactly which obligations apply, to whom, and by when, is non-obvious.
3. **They cannot assemble the conformity and registration package.** High-risk providers must prepare Annex IV technical documentation, run a conformity assessment, draw up an EU declaration of conformity, affix CE marking, and register the system in the EU database (Art 49 / Art 71). Tracking which artifacts exist, which are missing, and whether the package is submission-ready is a manual spreadsheet today.

The result: governance teams maintain fragile spreadsheets, legal counsel re-derives the same analysis for every system, and nobody can answer "are we ready" with confidence.

## Target Users

- **Heads of AI Governance** at mid-market and enterprise companies shipping AI into the EU. They own the portfolio view and the readiness metrics.
- **Data Protection Officers (DPOs)** who already run GDPR programs and now own AI Act overlap.
- **General Counsel / Legal Ops** who need defensible, cited classifications and the declaration-of-conformity artifacts.
- **AI Product / ML leads** who fill in the intake for each system and own the evidence artifacts.

## Why this is NOT an existing project

This is deliberately distinct from the near-neighbor projects in the portfolio:

- **NOT `audit-compliance-platform` or `legal-compliance-platform`** (generic GRC). Those manage generic control libraries and audit checklists across arbitrary frameworks. AI Act Classification Desk encodes the **specific EU AI Act Annex III taxonomy, the Article 5 prohibited-practice list, and the Article 9 to 15 + Annex IV statutory obligations as a hard-coded deterministic legal engine**. The classification logic is not a configurable checklist; it is the Act itself expressed as a decision tree with cited rule hits.
- **NOT `dpia-decision-engine`** (the GDPR DPIA-trigger sibling). That decides whether a *data-processing activity* requires a Data Protection Impact Assessment under GDPR Article 35. This product classifies *AI systems* into *AI Act* risk tiers. Different statute, different unit of analysis (AI system vs processing activity), different output (risk tier + Annex IV evidence vs DPIA-required yes/no).
- **NOT a model-card / model registry.** Model cards document a model's training data, metrics, and intended use for ML transparency. This product does not catalog model internals; it classifies the *deployment use-case* against the Act's risk categories and derives *statutory* obligations and registration artifacts. A model card might be one piece of Annex IV evidence, but the product is the legal engine around it.

The sharp difference: this is a **deterministic EU-AI-Act legal engine** (Annex III decision tree + prohibited-practice list + tier-specific statutory obligations + Annex IV evidence + EU-database registration package), not a generic compliance checklist, not a GDPR tool, and not a model catalog.

## Build / Stack

- Backend: Hono + TypeScript (Render or local), mounted under `/api/v1`.
- Frontend: Next.js 16 + React 19 + Tailwind 4, Neon Auth.
- Database: Neon Postgres via drizzle-orm.
- The classifier is a deterministic rules engine: a versioned decision tree over a structured intake covering Article 5 prohibited practices and Annex III high-risk categories, plus Article 50 limited-risk transparency triggers.
- Built-in sample-data seeder so classification, obligations, and gap scoring are demoable on first boot.
- All features FREE for signed-in users. Stripe optional (checkout/portal/webhook return 503 when unconfigured).

---

# MAJOR FEATURE SECTIONS

## 1. AI-System Intake Register

The system-of-record for every AI system in scope.

- Capture system name, internal ID, description, business unit, owner.
- **Provider-vs-deployer role** selection (provider, deployer, importer, distributor, product-manufacturer) per Article 3 definitions.
- Intended **purpose** free-text plus a structured purpose category.
- **Modality** (computer vision, NLP/LLM, tabular/scoring, biometrics, recommendation, robotics, multimodal, other).
- **Deployment geography** (EU member states list + EEA + non-EU; flags whether the system is "placed on the EU market" or "put into service" in the EU).
- **Lifecycle stage** (concept, development, testing, market-placement, in-service, withdrawn).
- General-purpose AI (GPAI) flag and systemic-risk flag (Art 51) for foundation models.
- Versioning of intake records; every edit produces an intake snapshot.
- Tags, owner assignment, status (draft / classified / under-review / registered).
- Soft-archive and restore.
- Per-system activity timeline.

## 2. Deterministic Risk-Tier Classifier

The legal engine. Walks a versioned decision tree and outputs a tier with cited rationale.

- **Prohibited-practice screen (Article 5)**: subliminal manipulation, exploitation of vulnerabilities, social scoring, real-time remote biometric identification in public spaces, biometric categorization by sensitive attributes, emotion recognition in workplace/education, untargeted facial-image scraping, predictive policing of individuals. Any hit → tier = prohibited.
- **Annex III high-risk screen**: biometrics; critical infrastructure; education & vocational training; employment & worker management; access to essential private/public services (incl. credit scoring, insurance); law enforcement; migration/asylum/border control; administration of justice & democratic processes. Any in-scope hit → candidate high-risk.
- **Article 6(3) derogation check**: even an Annex III system can be non-high-risk if it does not pose a significant risk (narrow procedural task, improves prior human activity, detects deviation, preparatory task) AND does not profile. Records the derogation rationale.
- **Article 50 limited-risk screen**: direct human interaction (chatbots), synthetic content generation, deepfakes, emotion recognition / biometric categorization (where not prohibited) → limited-risk transparency obligations.
- Default minimal-risk when no rule fires.
- **Cited rationale per rule hit**: each fired rule records the Act article/Annex, the question that triggered it, and the answer.
- Re-classify on intake change; classification is versioned and immutable once recorded.
- Confidence/coverage indicator (which questions were answered vs skipped).
- Rule-set versioning so a classification records which rule-set version produced it.
- Manual override with required legal justification and reviewer sign-off.

## 3. Per-Tier Obligation Generator

From the tier, derive the statutory obligation checklist.

- **High-risk obligations** mapped to articles: risk management system (Art 9), data & data governance (Art 10), technical documentation (Art 11), record-keeping/logging (Art 12), transparency & information to deployers (Art 13), human oversight (Art 14), accuracy/robustness/cybersecurity (Art 15), quality management system (Art 17), conformity assessment (Art 43), EU declaration of conformity (Art 47), CE marking (Art 48), registration (Art 49).
- **Deployer-specific obligations** (Art 26): use per instructions, human oversight assignment, input-data relevance, monitoring & logging retention, fundamental-rights impact assessment for certain deployers (Art 27).
- **Limited-risk obligations** (Art 50): transparency notice to end-users, marking of synthetic/AI-generated content.
- **GPAI obligations** (Art 53 / Art 55) for foundation models and systemic-risk models.
- Each obligation: title, article citation, description, applicability reason, owner, due date, status (not-started / in-progress / blocked / complete / not-applicable), evidence links.
- Auto-regenerate obligations when tier or role changes (preserving manual status where the obligation persists).
- Obligation templates per tier are versioned.
- Bulk status update; assign owner; set due date.

## 4. Conformity-Evidence Tracker

Map Annex IV technical-documentation requirements to artifacts.

- The **Annex IV requirement catalog** as discrete items: general description, design specs, monitoring/control, risk-management documentation, data requirements, human-oversight measures, accuracy/robustness/cybersecurity metrics, change log, list of standards applied, EU declaration of conformity copy, post-market monitoring plan.
- For each requirement: link or upload artifact (file metadata + URL), set status (missing / draft / in-review / approved / not-applicable), reviewer, last-updated.
- **Gap score** and **readiness %** per system (approved required items / total required items).
- Per-requirement notes and review history.
- Evidence reuse across systems (link the same artifact to multiple requirements).
- Filter evidence by status, requirement category, reviewer.
- Export the evidence index.

## 5. Transparency-Notice Builder

For limited-risk systems, generate versioned end-user transparency notices.

- Notice templates per Article 50 trigger (chatbot disclosure, AI-generated-content marking, deepfake labeling, emotion-recognition notice).
- Token substitution (system name, provider name, contact, purpose).
- **Versioned** notices with publish/unpublish and an immutable version history.
- Live preview and copy-to-clipboard / export (plain text + HTML).
- Multi-language placeholder support (locale field).
- Link a notice to the system that requires it; mark obligation complete when published.

## 6. EU Registry Package Assembler

Assemble the high-risk registration package with a submission-readiness gate.

- The Article 49 / Annex VIII registration field set (provider details, system identification, intended purpose, status, member states, declaration of conformity reference, instructions for use link, conformity-assessment body if applicable).
- **Submission-readiness gate**: package can be marked submission-ready only when all required fields are filled AND the conformity-evidence readiness is 100% AND a declaration of conformity exists.
- Readiness checklist with per-item pass/fail and the blocking reasons.
- Versioned packages; export the package as a structured JSON / printable summary.
- Status (draft / ready / submitted / registered) with a registered-reference field for the EU database entry.

## 7. Role-Reasoning Engine

Detect when a change flips a deployer into a provider and re-derive.

- Track **substantial modifications** and **fine-tunes** as role-events on a system (Art 25): re-branding under own name, substantial modification, modifying intended purpose of a high-risk system.
- When a role-event flips the system's effective role (deployer → provider), the engine re-derives the role, marks the change, and triggers obligation regeneration.
- Role-change log with before/after role, the triggering event, and the new obligations introduced.
- Notification + dashboard flag on role flips.
- Manual role override with justification.

## 8. AI-System Portfolio Dashboard

The governance overview.

- Systems by tier (prohibited / high / limited / minimal) with counts and a distribution chart.
- Obligation completion % across the portfolio.
- Evidence-gap summary (systems below readiness threshold).
- Registry status (draft / ready / submitted / registered).
- Upcoming deadlines (next N obligations due).
- Recent role flips and recent classifications.
- Per-system quick links.

## 9. Obligations Registry

Cross-system obligation management.

- Global list of all obligations across all systems with filters (tier, article, status, owner, due date, system).
- Inline status updates and owner assignment.
- Overdue and due-soon views.
- Group by article / by system.
- Bulk actions (assign, set due date, mark complete).

## 10. Evidence Registry

Cross-system evidence management.

- Global list of evidence artifacts with status, requirement mapping, reviewer.
- Filter and search; identify orphaned artifacts and missing required items.
- Reviewer workload view.

## 11. Deadlines & Calendar

- Aggregated deadline view across obligations and registry milestones.
- Due-soon / overdue buckets.
- Per-assignee deadline lists.

## 12. Analytics

- Tier distribution over time.
- Readiness trend (portfolio readiness % over time).
- Obligation burndown.
- Evidence-gap trend.
- Classification activity (classifications per week).
- Top blocking requirements across systems.

## 13. Search

- Global search across systems, obligations, evidence, notices, registry packages.
- Typed results with deep links.

## 14. Tags & Saved Filters

- CRUD tags; assign to systems.
- Save named filter sets (e.g. "high-risk not ready", "due this month") and recall them.

## 15. Bulk Actions

- Bulk re-classify selected systems.
- Bulk assign owner / set status on systems.
- Bulk obligation status updates.

## 16. Notifications

- In-app notifications for: classification complete, tier change, role flip, obligation due-soon/overdue, evidence approved/rejected, registry package marked ready.
- Mark-read / mark-all-read; unread count.

## 17. Outbound Webhooks

- Register webhook endpoints with event subscriptions (classification.completed, tier.changed, role.flipped, obligation.overdue, registry.ready).
- Delivery log with status and response code; manual re-send.
- Per-webhook secret for signature.

## 18. Public API & API Keys

- Issue/revoke API keys (prefix + hashed secret) scoped to the user.
- Documented read endpoints for systems, classifications, obligations, evidence, registry status.
- Key last-used tracking.

## 19. Audit Log

- Immutable append-only log of every mutating action (who, what, when, entity, before/after summary).
- Filter by actor, entity type, action, date.
- Export.

## 20. Settings

- Organization/profile settings (org name, jurisdiction defaults).
- Notification preferences.
- Default member-states selection.
- Danger-zone (archive all sample data, reset demo).

## 21. Onboarding Wizard

- Guided first-run: create first system, run classification, review obligations, link first evidence, see the dashboard light up.
- Progress checklist persisted per user; dismissible.

## 22. Billing (Free; Stripe optional)

- All features free for signed-in users.
- `GET /billing/plan` returns the user's plan + `stripeEnabled` flag.
- Stripe checkout / portal / webhook return 503 when `STRIPE_SECRET_KEY` is unset.
- Plans table seeded with free + pro; subscriptions row auto-created on first read.

## 23. Sample-Data Seeder (built-in)

On first boot, seed a handful of AI systems spanning every tier with planted evidence gaps so the demo is instant:

- **Resume-screening / CV-ranking system** = Annex III employment high-risk (Art 6 + Annex III(4)). Planted: partial Annex IV evidence, missing declaration of conformity, registry not ready.
- **Customer-support chatbot** = Article 50 limited-risk (direct interaction). Planted: transparency notice not yet published.
- **Internal email spam filter** = minimal-risk. No obligations beyond voluntary.
- **Credit-scoring model** = Annex III essential-services high-risk (Annex III(5)(b)). Planted: high-readiness but one missing evidence item.
- **Social-scoring prototype** = prohibited (Art 5(1)(c)) to demonstrate the prohibited path.
- Each seeded system has a recorded classification with cited rule hits, generated obligations, and evidence items at mixed statuses so gap scoring and readiness % are non-trivial on first view.

---

# DATA MODEL (tables)

- **ai_systems** — the intake register. id, user_id, name, description, role, intended_purpose, purpose_category, modality, geographies (jsonb), lifecycle_stage, is_gpai, is_systemic_risk, status, tags (jsonb), archived, created_at, updated_at.
- **system_versions** — immutable intake snapshots. id, system_id, snapshot (jsonb), created_by, created_at.
- **classifications** — classification results. id, system_id, tier, ruleset_version, rationale (jsonb array of rule hits), coverage_pct, is_override, override_justification, created_by, created_at.
- **rule_hits** — denormalized per-rule citations (optional flattening). id, classification_id, rule_code, article_ref, question, answer, contributes_to_tier, created_at.
- **classification_answers** — the structured questionnaire answers. id, system_id, classification_id, question_key, answer (jsonb), created_at.
- **obligations** — generated obligation checklist items. id, system_id, tier, article_ref, title, description, applicability_reason, owner, due_date, status, template_code, created_at, updated_at.
- **evidence_requirements** — Annex IV catalog items per system. id, system_id, requirement_code, category, title, description, required, status, artifact_url, artifact_meta (jsonb), reviewer, notes, updated_at, created_at.
- **evidence_artifacts** — uploaded/linked artifacts reusable across requirements. id, user_id, name, url, meta (jsonb), created_at.
- **transparency_notices** — versioned notices. id, system_id, trigger_code, locale, version, body, body_html, published, created_by, created_at.
- **registry_packages** — registration packages. id, system_id, fields (jsonb), status, readiness_pct, blocking_reasons (jsonb), registered_reference, version, created_at, updated_at.
- **role_events** — substantial-modification / fine-tune events. id, system_id, event_type, description, before_role, after_role, flipped, created_by, created_at.
- **deadlines** — derived/explicit deadlines (may be a view over obligations + registry; stored for custom milestones). id, system_id, label, due_date, source, status, created_at.
- **tags** — id, user_id, name, color, created_at.
- **saved_filters** — id, user_id, name, scope, criteria (jsonb), created_at.
- **notifications** — id, user_id, type, title, body, entity_type, entity_id, read, created_at.
- **webhooks** — id, user_id, url, events (jsonb), secret, active, created_at.
- **webhook_deliveries** — id, webhook_id, event, payload (jsonb), status_code, ok, created_at.
- **api_keys** — id, user_id, name, prefix, hashed_secret, last_used_at, created_at.
- **audit_log** — id, user_id, action, entity_type, entity_id, summary, meta (jsonb), created_at.
- **onboarding_progress** — id, user_id, steps (jsonb), dismissed, created_at, updated_at.
- **plans** — id (text, 'free'/'pro'), name, price_cents, created_at.
- **subscriptions** — id, user_id (unique), plan_id, stripe_customer_id, stripe_subscription_id, status, current_period_end, created_at, updated_at.

---

# API SURFACE (high level)

Mounted under `/api/v1`. Public reads, auth-gated writes, ownership checks.

- `/systems` — CRUD AI systems, archive/restore, versions, activity.
- `/classify` — run classifier, fetch questionnaire, get classification, override.
- `/obligations` — list/regenerate/update obligations, bulk update.
- `/evidence` — requirements per system, update status, link artifacts, readiness; artifact CRUD.
- `/notices` — transparency notice CRUD, versions, publish.
- `/registry` — registry package get/update, readiness recompute, submission gate.
- `/roles` — role events, role-change log, re-derive.
- `/dashboard` — portfolio summary.
- `/deadlines` — aggregated deadlines.
- `/analytics` — trend datasets.
- `/search` — global search.
- `/tags` — tag CRUD + assignment.
- `/filters` — saved-filter CRUD.
- `/bulk` — bulk actions.
- `/notifications` — list, mark-read.
- `/webhooks` — webhook CRUD, deliveries.
- `/api-keys` — key CRUD.
- `/audit` — audit-log list.
- `/settings` — get/update settings.
- `/onboarding` — progress get/update.
- `/billing` — plan, checkout, portal, webhook.
- `/rulesets` — current rule-set metadata + questionnaire definition.

---

# FRONTEND PAGES (~24)

Public:
1. `/` — landing (static).
2. `/auth/sign-in`.
3. `/auth/sign-up`.
4. `/pricing`.

Dashboard (under `/dashboard/*` with shared sidebar layout):
5. `/dashboard` — portfolio overview.
6. `/dashboard/systems` — system register list.
7. `/dashboard/systems/new` — intake form.
8. `/dashboard/systems/[id]` — system detail (classification, obligations, evidence, registry tabs summary).
9. `/dashboard/systems/[id]/classify` — run the classifier questionnaire + result.
10. `/dashboard/obligations` — obligations registry.
11. `/dashboard/evidence` — evidence registry.
12. `/dashboard/notices` — transparency notices list + builder.
13. `/dashboard/registry` — registry packages list + readiness.
14. `/dashboard/roles` — role events / role-change log.
15. `/dashboard/deadlines` — deadlines & calendar.
16. `/dashboard/analytics` — analytics charts.
17. `/dashboard/search` — global search.
18. `/dashboard/tags` — tags & saved filters.
19. `/dashboard/notifications` — notifications.
20. `/dashboard/webhooks` — webhooks + delivery log.
21. `/dashboard/api-keys` — API keys.
22. `/dashboard/audit` — audit log.
23. `/dashboard/settings` — settings.
24. `/dashboard/onboarding` — onboarding wizard.
