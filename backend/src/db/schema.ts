import { pgTable, text, integer, boolean, timestamp, jsonb, unique, real } from 'drizzle-orm/pg-core'

// 1. AI-system intake register
export const ai_systems = pgTable('ai_systems', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  description: text('description').default('').notNull(),
  role: text('role').notNull(), // provider | deployer | importer | distributor | product_manufacturer
  intended_purpose: text('intended_purpose').default('').notNull(),
  purpose_category: text('purpose_category').default('').notNull(),
  modality: text('modality').default('other').notNull(),
  geographies: jsonb('geographies').$type<string[]>().default([]),
  placed_on_eu_market: boolean('placed_on_eu_market').default(true).notNull(),
  lifecycle_stage: text('lifecycle_stage').default('concept').notNull(),
  is_gpai: boolean('is_gpai').default(false).notNull(),
  is_systemic_risk: boolean('is_systemic_risk').default(false).notNull(),
  status: text('status').default('draft').notNull(), // draft | classified | under_review | registered
  current_tier: text('current_tier'), // prohibited | high | limited | minimal | null
  tags: jsonb('tags').$type<string[]>().default([]),
  archived: boolean('archived').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// 2. Immutable intake snapshots
export const system_versions = pgTable('system_versions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').notNull().references(() => ai_systems.id),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().default({}),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// 3. Classification results
export const classifications = pgTable('classifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').notNull().references(() => ai_systems.id),
  tier: text('tier').notNull(), // prohibited | high | limited | minimal
  ruleset_version: text('ruleset_version').notNull(),
  rationale: jsonb('rationale').$type<Array<{ rule_code: string; article_ref: string; question: string; answer: string }>>().default([]),
  coverage_pct: real('coverage_pct').default(0),
  is_override: boolean('is_override').default(false).notNull(),
  override_justification: text('override_justification'),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Denormalized per-rule citations
export const rule_hits = pgTable('rule_hits', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  classification_id: text('classification_id').notNull().references(() => classifications.id),
  rule_code: text('rule_code').notNull(),
  article_ref: text('article_ref').notNull(),
  question: text('question').default('').notNull(),
  answer: text('answer').default('').notNull(),
  contributes_to_tier: text('contributes_to_tier').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Structured questionnaire answers
export const classification_answers = pgTable('classification_answers', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').notNull().references(() => ai_systems.id),
  classification_id: text('classification_id').references(() => classifications.id),
  question_key: text('question_key').notNull(),
  answer: jsonb('answer').$type<unknown>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// 4. Generated obligation checklist items
export const obligations = pgTable('obligations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').notNull().references(() => ai_systems.id),
  user_id: text('user_id').notNull(),
  tier: text('tier').notNull(),
  article_ref: text('article_ref').notNull(),
  title: text('title').notNull(),
  description: text('description').default('').notNull(),
  applicability_reason: text('applicability_reason').default('').notNull(),
  template_code: text('template_code').notNull(),
  owner: text('owner'),
  due_date: timestamp('due_date'),
  status: text('status').default('not_started').notNull(), // not_started | in_progress | blocked | complete | not_applicable
  evidence_links: jsonb('evidence_links').$type<string[]>().default([]),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// 5. Annex IV evidence requirements per system
export const evidence_requirements = pgTable('evidence_requirements', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').notNull().references(() => ai_systems.id),
  user_id: text('user_id').notNull(),
  requirement_code: text('requirement_code').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  description: text('description').default('').notNull(),
  required: boolean('required').default(true).notNull(),
  status: text('status').default('missing').notNull(), // missing | draft | in_review | approved | not_applicable
  artifact_url: text('artifact_url'),
  artifact_meta: jsonb('artifact_meta').$type<Record<string, unknown>>().default({}),
  reviewer: text('reviewer'),
  notes: text('notes').default('').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// Reusable evidence artifacts
export const evidence_artifacts = pgTable('evidence_artifacts', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  url: text('url').default('').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// 6. Versioned transparency notices
export const transparency_notices = pgTable('transparency_notices', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').notNull().references(() => ai_systems.id),
  user_id: text('user_id').notNull(),
  trigger_code: text('trigger_code').notNull(), // chatbot | synthetic_content | deepfake | emotion_recognition
  locale: text('locale').default('en').notNull(),
  version: integer('version').default(1).notNull(),
  body: text('body').default('').notNull(),
  body_html: text('body_html').default('').notNull(),
  published: boolean('published').default(false).notNull(),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// 7. EU registry packages
export const registry_packages = pgTable('registry_packages', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').notNull().references(() => ai_systems.id).unique(),
  user_id: text('user_id').notNull(),
  fields: jsonb('fields').$type<Record<string, unknown>>().default({}),
  status: text('status').default('draft').notNull(), // draft | ready | submitted | registered
  readiness_pct: real('readiness_pct').default(0),
  blocking_reasons: jsonb('blocking_reasons').$type<string[]>().default([]),
  registered_reference: text('registered_reference'),
  version: integer('version').default(1).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// 8. Role-reasoning events
export const role_events = pgTable('role_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').notNull().references(() => ai_systems.id),
  user_id: text('user_id').notNull(),
  event_type: text('event_type').notNull(), // rebrand | substantial_modification | purpose_change | finetune
  description: text('description').default('').notNull(),
  before_role: text('before_role').notNull(),
  after_role: text('after_role').notNull(),
  flipped: boolean('flipped').default(false).notNull(),
  created_by: text('created_by').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Deadlines / custom milestones
export const deadlines = pgTable('deadlines', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  system_id: text('system_id').references(() => ai_systems.id),
  user_id: text('user_id').notNull(),
  label: text('label').notNull(),
  due_date: timestamp('due_date').notNull(),
  source: text('source').default('custom').notNull(), // custom | obligation | registry
  status: text('status').default('open').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Tags
export const tags = pgTable('tags', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  color: text('color').default('#6366f1').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
}, (t) => [unique().on(t.user_id, t.name)])

// Saved filters
export const saved_filters = pgTable('saved_filters', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  scope: text('scope').default('systems').notNull(),
  criteria: jsonb('criteria').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Notifications
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').default('').notNull(),
  entity_type: text('entity_type'),
  entity_id: text('entity_id'),
  read: boolean('read').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Webhooks
export const webhooks = pgTable('webhooks', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  url: text('url').notNull(),
  events: jsonb('events').$type<string[]>().default([]),
  secret: text('secret').default('').notNull(),
  active: boolean('active').default(true).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Webhook deliveries
export const webhook_deliveries = pgTable('webhook_deliveries', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  webhook_id: text('webhook_id').notNull().references(() => webhooks.id),
  event: text('event').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().default({}),
  status_code: integer('status_code').default(0),
  ok: boolean('ok').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// API keys
export const api_keys = pgTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  hashed_secret: text('hashed_secret').notNull(),
  last_used_at: timestamp('last_used_at'),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Audit log
export const audit_log = pgTable('audit_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull(),
  action: text('action').notNull(),
  entity_type: text('entity_type').notNull(),
  entity_id: text('entity_id'),
  summary: text('summary').default('').notNull(),
  meta: jsonb('meta').$type<Record<string, unknown>>().default({}),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Onboarding progress
export const onboarding_progress = pgTable('onboarding_progress', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  steps: jsonb('steps').$type<Record<string, boolean>>().default({}),
  dismissed: boolean('dismissed').default(false).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

// Billing: plans (text id 'free'/'pro')
export const plans = pgTable('plans', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  price_cents: integer('price_cents').default(0).notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
})

// Billing: subscriptions
export const subscriptions = pgTable('subscriptions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  user_id: text('user_id').notNull().unique(),
  plan_id: text('plan_id').notNull().default('free').references(() => plans.id),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  status: text('status').default('active').notNull(),
  current_period_end: timestamp('current_period_end'),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})
