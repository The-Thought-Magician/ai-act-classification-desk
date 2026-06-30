import { db } from './index.js'
import { sql } from 'drizzle-orm'

const statements: string[] = [
  `CREATE TABLE IF NOT EXISTS ai_systems (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    role text NOT NULL,
    intended_purpose text NOT NULL DEFAULT '',
    purpose_category text NOT NULL DEFAULT '',
    modality text NOT NULL DEFAULT 'other',
    geographies jsonb DEFAULT '[]'::jsonb,
    placed_on_eu_market boolean NOT NULL DEFAULT true,
    lifecycle_stage text NOT NULL DEFAULT 'concept',
    is_gpai boolean NOT NULL DEFAULT false,
    is_systemic_risk boolean NOT NULL DEFAULT false,
    status text NOT NULL DEFAULT 'draft',
    current_tier text,
    tags jsonb DEFAULT '[]'::jsonb,
    archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS system_versions (
    id text PRIMARY KEY,
    system_id text NOT NULL REFERENCES ai_systems(id),
    snapshot jsonb DEFAULT '{}'::jsonb,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS classifications (
    id text PRIMARY KEY,
    system_id text NOT NULL REFERENCES ai_systems(id),
    tier text NOT NULL,
    ruleset_version text NOT NULL,
    rationale jsonb DEFAULT '[]'::jsonb,
    coverage_pct real DEFAULT 0,
    is_override boolean NOT NULL DEFAULT false,
    override_justification text,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS rule_hits (
    id text PRIMARY KEY,
    classification_id text NOT NULL REFERENCES classifications(id),
    rule_code text NOT NULL,
    article_ref text NOT NULL,
    question text NOT NULL DEFAULT '',
    answer text NOT NULL DEFAULT '',
    contributes_to_tier text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS classification_answers (
    id text PRIMARY KEY,
    system_id text NOT NULL REFERENCES ai_systems(id),
    classification_id text REFERENCES classifications(id),
    question_key text NOT NULL,
    answer jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS obligations (
    id text PRIMARY KEY,
    system_id text NOT NULL REFERENCES ai_systems(id),
    user_id text NOT NULL,
    tier text NOT NULL,
    article_ref text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    applicability_reason text NOT NULL DEFAULT '',
    template_code text NOT NULL,
    owner text,
    due_date timestamptz,
    status text NOT NULL DEFAULT 'not_started',
    evidence_links jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS evidence_requirements (
    id text PRIMARY KEY,
    system_id text NOT NULL REFERENCES ai_systems(id),
    user_id text NOT NULL,
    requirement_code text NOT NULL,
    category text NOT NULL,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    required boolean NOT NULL DEFAULT true,
    status text NOT NULL DEFAULT 'missing',
    artifact_url text,
    artifact_meta jsonb DEFAULT '{}'::jsonb,
    reviewer text,
    notes text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS evidence_artifacts (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    url text NOT NULL DEFAULT '',
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS transparency_notices (
    id text PRIMARY KEY,
    system_id text NOT NULL REFERENCES ai_systems(id),
    user_id text NOT NULL,
    trigger_code text NOT NULL,
    locale text NOT NULL DEFAULT 'en',
    version integer NOT NULL DEFAULT 1,
    body text NOT NULL DEFAULT '',
    body_html text NOT NULL DEFAULT '',
    published boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS registry_packages (
    id text PRIMARY KEY,
    system_id text NOT NULL UNIQUE REFERENCES ai_systems(id),
    user_id text NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'draft',
    readiness_pct real DEFAULT 0,
    blocking_reasons jsonb DEFAULT '[]'::jsonb,
    registered_reference text,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS role_events (
    id text PRIMARY KEY,
    system_id text NOT NULL REFERENCES ai_systems(id),
    user_id text NOT NULL,
    event_type text NOT NULL,
    description text NOT NULL DEFAULT '',
    before_role text NOT NULL,
    after_role text NOT NULL,
    flipped boolean NOT NULL DEFAULT false,
    created_by text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS deadlines (
    id text PRIMARY KEY,
    system_id text REFERENCES ai_systems(id),
    user_id text NOT NULL,
    label text NOT NULL,
    due_date timestamptz NOT NULL,
    source text NOT NULL DEFAULT 'custom',
    status text NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS tags (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#6366f1',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, name)
  )`,
  `CREATE TABLE IF NOT EXISTS saved_filters (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    scope text NOT NULL DEFAULT 'systems',
    criteria jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS notifications (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    type text NOT NULL,
    title text NOT NULL,
    body text NOT NULL DEFAULT '',
    entity_type text,
    entity_id text,
    read boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS webhooks (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    url text NOT NULL,
    events jsonb DEFAULT '[]'::jsonb,
    secret text NOT NULL DEFAULT '',
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id text PRIMARY KEY,
    webhook_id text NOT NULL REFERENCES webhooks(id),
    event text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb,
    status_code integer DEFAULT 0,
    ok boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    hashed_secret text NOT NULL,
    last_used_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id text PRIMARY KEY,
    user_id text NOT NULL,
    action text NOT NULL,
    entity_type text NOT NULL,
    entity_id text,
    summary text NOT NULL DEFAULT '',
    meta jsonb DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS onboarding_progress (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    steps jsonb DEFAULT '{}'::jsonb,
    dismissed boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS plans (
    id text PRIMARY KEY,
    name text NOT NULL,
    price_cents integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id text PRIMARY KEY,
    user_id text NOT NULL UNIQUE,
    plan_id text NOT NULL DEFAULT 'free' REFERENCES plans(id),
    stripe_customer_id text,
    stripe_subscription_id text,
    status text NOT NULL DEFAULT 'active',
    current_period_end timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
]

const indexes: string[] = [
  `CREATE INDEX IF NOT EXISTS idx_ai_systems_user_id ON ai_systems(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_system_versions_system_id ON system_versions(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_classifications_system_id ON classifications(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rule_hits_classification_id ON rule_hits(classification_id)`,
  `CREATE INDEX IF NOT EXISTS idx_classification_answers_system_id ON classification_answers(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_obligations_system_id ON obligations(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_obligations_user_id ON obligations(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_requirements_system_id ON evidence_requirements(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_requirements_user_id ON evidence_requirements(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_evidence_artifacts_user_id ON evidence_artifacts(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_transparency_notices_system_id ON transparency_notices(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_registry_packages_system_id ON registry_packages(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_role_events_system_id ON role_events(system_id)`,
  `CREATE INDEX IF NOT EXISTS idx_deadlines_user_id ON deadlines(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id ON saved_filters(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhooks(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id)`,
  `CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_audit_log_user_id ON audit_log(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id)`,
]

export async function migrate() {
  for (const stmt of statements) {
    await db.execute(sql.raw(stmt))
  }
  for (const idx of indexes) {
    await db.execute(sql.raw(idx))
  }
  console.log('Migration complete: tables + indexes provisioned')
}
