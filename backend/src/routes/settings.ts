import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  saved_filters,
  ai_systems,
  system_versions,
  classifications,
  rule_hits,
  classification_answers,
  obligations,
  evidence_requirements,
  evidence_artifacts,
  transparency_notices,
  registry_packages,
  role_events,
  deadlines,
  audit_log,
} from '../db/schema.js'
import { eq, and, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// There is no dedicated `settings` table; user/org settings are persisted as a
// single reserved row in `saved_filters` (scope = SETTINGS_SCOPE) whose
// `criteria` jsonb holds the settings blob. This keeps settings real,
// DB-backed and ownership-scoped without a schema change.
const SETTINGS_SCOPE = '__settings__'
const SETTINGS_NAME = 'user-settings'

const RULESET_VERSION = 'eu-ai-act-2024/1689-v1'

const DEFAULT_SETTINGS = {
  org_name: '',
  jurisdiction_default: 'EU',
  default_member_states: ['DE', 'FR', 'ES', 'IT', 'NL'] as string[],
  notification_prefs: {
    classification_changes: true,
    role_flips: true,
    deadlines_due_soon: true,
    evidence_gaps: true,
  },
  ruleset_version: RULESET_VERSION,
}

type Settings = typeof DEFAULT_SETTINGS

function mergeSettings(stored: unknown): Settings {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  const prefs = (s.notification_prefs && typeof s.notification_prefs === 'object'
    ? s.notification_prefs
    : {}) as Record<string, unknown>
  return {
    org_name: typeof s.org_name === 'string' ? s.org_name : DEFAULT_SETTINGS.org_name,
    jurisdiction_default:
      typeof s.jurisdiction_default === 'string'
        ? s.jurisdiction_default
        : DEFAULT_SETTINGS.jurisdiction_default,
    default_member_states: Array.isArray(s.default_member_states)
      ? (s.default_member_states as string[])
      : DEFAULT_SETTINGS.default_member_states,
    notification_prefs: {
      classification_changes:
        typeof prefs.classification_changes === 'boolean'
          ? prefs.classification_changes
          : DEFAULT_SETTINGS.notification_prefs.classification_changes,
      role_flips:
        typeof prefs.role_flips === 'boolean'
          ? prefs.role_flips
          : DEFAULT_SETTINGS.notification_prefs.role_flips,
      deadlines_due_soon:
        typeof prefs.deadlines_due_soon === 'boolean'
          ? prefs.deadlines_due_soon
          : DEFAULT_SETTINGS.notification_prefs.deadlines_due_soon,
      evidence_gaps:
        typeof prefs.evidence_gaps === 'boolean'
          ? prefs.evidence_gaps
          : DEFAULT_SETTINGS.notification_prefs.evidence_gaps,
    },
    ruleset_version: RULESET_VERSION,
  }
}

async function loadOrCreateSettings(userId: string): Promise<Settings> {
  const [row] = await db
    .select()
    .from(saved_filters)
    .where(and(eq(saved_filters.user_id, userId), eq(saved_filters.scope, SETTINGS_SCOPE)))
    .limit(1)
  if (row) return mergeSettings(row.criteria)
  const merged = mergeSettings({})
  await db.insert(saved_filters).values({
    user_id: userId,
    name: SETTINGS_NAME,
    scope: SETTINGS_SCOPE,
    criteria: merged as unknown as Record<string, unknown>,
  })
  return merged
}

// GET / — current user's settings (auto-create defaults on first read).
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const settings = await loadOrCreateSettings(userId)
  return c.json(settings)
})

const settingsUpdateSchema = z.object({
  org_name: z.string().max(200).optional(),
  jurisdiction_default: z.string().max(64).optional(),
  default_member_states: z.array(z.string().max(8)).max(64).optional(),
  notification_prefs: z
    .object({
      classification_changes: z.boolean().optional(),
      role_flips: z.boolean().optional(),
      deadlines_due_soon: z.boolean().optional(),
      evidence_gaps: z.boolean().optional(),
    })
    .optional(),
})

// PUT / — update settings.
router.put('/', authMiddleware, zValidator('json', settingsUpdateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const current = await loadOrCreateSettings(userId)
  const next: Settings = mergeSettings({
    ...current,
    ...body,
    notification_prefs: { ...current.notification_prefs, ...(body.notification_prefs ?? {}) },
  })
  await db
    .update(saved_filters)
    .set({ criteria: next as unknown as Record<string, unknown> })
    .where(and(eq(saved_filters.user_id, userId), eq(saved_filters.scope, SETTINGS_SCOPE)))
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'update',
    entity_type: 'settings',
    entity_id: null,
    summary: 'Updated user/org settings',
    meta: { fields: Object.keys(body) },
  })
  return c.json(next)
})

// ---------------------------------------------------------------------------
// reset-demo: wipe this user's data and re-seed the sample portfolio.
// ---------------------------------------------------------------------------

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 86_400_000)
}

const HIGH_RISK_OBLIGATIONS: Array<{ template_code: string; article_ref: string; title: string; description: string; reason: string }> = [
  { template_code: 'art9', article_ref: 'Art 9', title: 'Risk management system', description: 'Establish, implement and maintain a risk management system across the lifecycle.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art10', article_ref: 'Art 10', title: 'Data and data governance', description: 'Training, validation and testing data sets meet quality criteria.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art11', article_ref: 'Art 11', title: 'Technical documentation', description: 'Draw up Annex IV technical documentation before placing on the market.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art12', article_ref: 'Art 12', title: 'Record-keeping and logging', description: 'Automatic recording of events (logs) over the lifetime of the system.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art13', article_ref: 'Art 13', title: 'Transparency and information to deployers', description: 'Provide instructions for use enabling deployers to interpret output.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art14', article_ref: 'Art 14', title: 'Human oversight', description: 'Design for effective oversight by natural persons during use.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art15', article_ref: 'Art 15', title: 'Accuracy, robustness and cybersecurity', description: 'Appropriate levels of accuracy, robustness and cybersecurity.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art43', article_ref: 'Art 43', title: 'Conformity assessment', description: 'Undergo the relevant conformity-assessment procedure.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art47', article_ref: 'Art 47', title: 'EU declaration of conformity', description: 'Draw up a written EU declaration of conformity.', reason: 'High-risk system (Annex III).' },
  { template_code: 'art49', article_ref: 'Art 49', title: 'Registration in the EU database', description: 'Register the high-risk system in the EU database before market placement.', reason: 'High-risk system (Annex III).' },
]

const LIMITED_RISK_OBLIGATIONS: Array<{ template_code: string; article_ref: string; title: string; description: string; reason: string }> = [
  { template_code: 'art50_disclosure', article_ref: 'Art 50', title: 'End-user transparency notice', description: 'Inform natural persons that they are interacting with an AI system.', reason: 'Limited-risk transparency trigger (Art 50).' },
  { template_code: 'art50_marking', article_ref: 'Art 50', title: 'Mark synthetic/AI-generated content', description: 'Mark AI-generated or manipulated content as artificially produced.', reason: 'Limited-risk transparency trigger (Art 50).' },
]

const ANNEX_IV_REQUIREMENTS: Array<{ requirement_code: string; category: string; title: string; description: string }> = [
  { requirement_code: 'annex_iv_1', category: 'general', title: 'General description of the AI system', description: 'Intended purpose, provider, versions and how it interacts with hardware/software.' },
  { requirement_code: 'annex_iv_2', category: 'design', title: 'Design specifications', description: 'General logic, key design choices, system architecture.' },
  { requirement_code: 'annex_iv_3', category: 'data', title: 'Data requirements', description: 'Training methodologies and data sets used, provenance and labelling.' },
  { requirement_code: 'annex_iv_4', category: 'oversight', title: 'Human oversight measures', description: 'Measures enabling deployers to interpret and oversee the output.' },
  { requirement_code: 'annex_iv_5', category: 'performance', title: 'Accuracy, robustness and cybersecurity metrics', description: 'Metrics, expected accuracy and robustness/cybersecurity measures.' },
  { requirement_code: 'annex_iv_6', category: 'risk', title: 'Risk-management documentation', description: 'The risk-management system documentation per Art 9.' },
  { requirement_code: 'annex_iv_7', category: 'monitoring', title: 'Post-market monitoring plan', description: 'The system in place to evaluate performance after placement.' },
  { requirement_code: 'annex_iv_8', category: 'conformity', title: 'EU declaration of conformity copy', description: 'A copy of the EU declaration of conformity.' },
]

type SeedSpec = {
  name: string
  description: string
  role: string
  intended_purpose: string
  purpose_category: string
  modality: string
  geographies: string[]
  lifecycle_stage: string
  is_gpai: boolean
  status: string
  tier: string
  tags: string[]
  ruleHit: { rule_code: string; article_ref: string; question: string; answer: string }
  obligations: typeof HIGH_RISK_OBLIGATIONS
  evidence: boolean
  // index of an evidence requirement to leave 'missing' to plant a gap (-1 = none)
  plantedGapIndex: number
  approvedCount: number
  registryStatus: string
}

const SEED_SPECS: SeedSpec[] = [
  {
    name: 'CV Screening Assistant',
    description: 'Ranks job applicants from uploaded CVs for an HR team.',
    role: 'provider',
    intended_purpose: 'Automated screening and ranking of employment applications.',
    purpose_category: 'employment',
    modality: 'text',
    geographies: ['EU', 'DE'],
    lifecycle_stage: 'production',
    is_gpai: false,
    status: 'classified',
    tier: 'high',
    tags: ['hr', 'annex-iii'],
    ruleHit: { rule_code: 'annex_iii_4', article_ref: 'Annex III(4)', question: 'Used for recruitment or worker management?', answer: 'yes' },
    obligations: HIGH_RISK_OBLIGATIONS,
    evidence: true,
    plantedGapIndex: 7,
    approvedCount: 3,
    registryStatus: 'draft',
  },
  {
    name: 'Support Chatbot',
    description: 'Customer-facing conversational agent for billing questions.',
    role: 'deployer',
    intended_purpose: 'Answer customer support queries via chat.',
    purpose_category: 'customer_service',
    modality: 'text',
    geographies: ['EU', 'FR'],
    lifecycle_stage: 'production',
    is_gpai: false,
    status: 'classified',
    tier: 'limited',
    tags: ['chatbot', 'art-50'],
    ruleHit: { rule_code: 'art50_chatbot', article_ref: 'Art 50(1)', question: 'Directly interacts with natural persons?', answer: 'yes' },
    obligations: LIMITED_RISK_OBLIGATIONS,
    evidence: false,
    plantedGapIndex: -1,
    approvedCount: 0,
    registryStatus: 'draft',
  },
  {
    name: 'Internal Email Spam Filter',
    description: 'Flags inbound email as spam for internal mailboxes.',
    role: 'deployer',
    intended_purpose: 'Filter spam from internal corporate email.',
    purpose_category: 'productivity',
    modality: 'text',
    geographies: ['EU'],
    lifecycle_stage: 'production',
    is_gpai: false,
    status: 'classified',
    tier: 'minimal',
    tags: ['minimal', 'internal'],
    ruleHit: { rule_code: 'default_minimal', article_ref: 'Recital 165', question: 'Any prohibited / high-risk / Art 50 trigger fired?', answer: 'no' },
    obligations: [],
    evidence: false,
    plantedGapIndex: -1,
    approvedCount: 0,
    registryStatus: 'draft',
  },
  {
    name: 'Credit Scoring Engine',
    description: 'Evaluates creditworthiness of loan applicants.',
    role: 'provider',
    intended_purpose: 'Assess credit risk for consumer lending decisions.',
    purpose_category: 'creditworthiness',
    modality: 'tabular',
    geographies: ['EU', 'ES'],
    lifecycle_stage: 'production',
    is_gpai: false,
    status: 'under_review',
    tier: 'high',
    tags: ['finance', 'annex-iii'],
    ruleHit: { rule_code: 'annex_iii_5b', article_ref: 'Annex III(5)(b)', question: 'Used to evaluate creditworthiness or credit score?', answer: 'yes' },
    obligations: HIGH_RISK_OBLIGATIONS,
    evidence: true,
    plantedGapIndex: 7,
    approvedCount: 7,
    registryStatus: 'ready',
  },
  {
    name: 'Social Scoring Prototype',
    description: 'Scores citizens on aggregated social-behaviour signals.',
    role: 'provider',
    intended_purpose: 'General-purpose social scoring of individuals.',
    purpose_category: 'social_scoring',
    modality: 'tabular',
    geographies: ['EU', 'IT'],
    lifecycle_stage: 'pilot',
    is_gpai: false,
    status: 'draft',
    tier: 'prohibited',
    tags: ['biometrics', 'art-5'],
    ruleHit: { rule_code: 'art5_1_c', article_ref: 'Art 5(1)(c)', question: 'Performs social scoring leading to detrimental treatment?', answer: 'yes' },
    obligations: [],
    evidence: false,
    plantedGapIndex: -1,
    approvedCount: 0,
    registryStatus: 'draft',
  },
]

async function deleteUserData(userId: string): Promise<void> {
  // Collect this user's system ids (descendant rows are keyed by system_id and
  // must be removed before the parent systems to respect FKs).
  const systems = await db.select({ id: ai_systems.id }).from(ai_systems).where(eq(ai_systems.user_id, userId))
  const systemIds = systems.map((s) => s.id)

  if (systemIds.length > 0) {
    const classRows = await db
      .select({ id: classifications.id })
      .from(classifications)
      .where(inArray(classifications.system_id, systemIds))
    const classIds = classRows.map((r) => r.id)
    if (classIds.length > 0) {
      await db.delete(rule_hits).where(inArray(rule_hits.classification_id, classIds))
    }
    await db.delete(classification_answers).where(inArray(classification_answers.system_id, systemIds))
    await db.delete(classifications).where(inArray(classifications.system_id, systemIds))
    await db.delete(system_versions).where(inArray(system_versions.system_id, systemIds))
    await db.delete(transparency_notices).where(inArray(transparency_notices.system_id, systemIds))
    await db.delete(registry_packages).where(inArray(registry_packages.system_id, systemIds))
    await db.delete(role_events).where(inArray(role_events.system_id, systemIds))
  }

  await db.delete(deadlines).where(eq(deadlines.user_id, userId))
  await db.delete(obligations).where(eq(obligations.user_id, userId))
  await db.delete(evidence_requirements).where(eq(evidence_requirements.user_id, userId))
  await db.delete(evidence_artifacts).where(eq(evidence_artifacts.user_id, userId))

  if (systemIds.length > 0) {
    await db.delete(ai_systems).where(inArray(ai_systems.id, systemIds))
  }
}

async function seedUserDemo(userId: string): Promise<number> {
  let count = 0
  for (const spec of SEED_SPECS) {
    const [system] = await db
      .insert(ai_systems)
      .values({
        user_id: userId,
        name: spec.name,
        description: spec.description,
        role: spec.role,
        intended_purpose: spec.intended_purpose,
        purpose_category: spec.purpose_category,
        modality: spec.modality,
        geographies: spec.geographies,
        placed_on_eu_market: true,
        lifecycle_stage: spec.lifecycle_stage,
        is_gpai: spec.is_gpai,
        is_systemic_risk: false,
        status: spec.status,
        current_tier: spec.tier,
        tags: spec.tags,
      })
      .returning()

    // Intake snapshot.
    await db.insert(system_versions).values({
      system_id: system.id,
      snapshot: system as unknown as Record<string, unknown>,
      created_by: userId,
    })

    // Classification + cited rule hit.
    const [classification] = await db
      .insert(classifications)
      .values({
        system_id: system.id,
        tier: spec.tier,
        ruleset_version: RULESET_VERSION,
        rationale: [spec.ruleHit],
        coverage_pct: 100,
        is_override: false,
        created_by: userId,
      })
      .returning()
    await db.insert(rule_hits).values({
      classification_id: classification.id,
      rule_code: spec.ruleHit.rule_code,
      article_ref: spec.ruleHit.article_ref,
      question: spec.ruleHit.question,
      answer: spec.ruleHit.answer,
      contributes_to_tier: spec.tier,
    })
    await db.insert(classification_answers).values({
      system_id: system.id,
      classification_id: classification.id,
      question_key: spec.ruleHit.rule_code,
      answer: spec.ruleHit.answer,
    })

    // Obligations at mixed statuses, with staggered future due dates.
    const obligationStatuses = ['complete', 'in_progress', 'not_started', 'blocked']
    for (let i = 0; i < spec.obligations.length; i++) {
      const ob = spec.obligations[i]
      await db.insert(obligations).values({
        system_id: system.id,
        user_id: userId,
        tier: spec.tier,
        article_ref: ob.article_ref,
        title: ob.title,
        description: ob.description,
        applicability_reason: ob.reason,
        template_code: ob.template_code,
        status: obligationStatuses[i % obligationStatuses.length],
        due_date: daysFromNow(14 + i * 7),
      })
    }

    // Evidence requirements (only for high-risk systems) at mixed statuses with
    // a planted gap.
    if (spec.evidence) {
      for (let i = 0; i < ANNEX_IV_REQUIREMENTS.length; i++) {
        const req = ANNEX_IV_REQUIREMENTS[i]
        let status: string
        if (i === spec.plantedGapIndex) status = 'missing'
        else if (i < spec.approvedCount) status = 'approved'
        else status = 'in_review'
        await db.insert(evidence_requirements).values({
          system_id: system.id,
          user_id: userId,
          requirement_code: req.requirement_code,
          category: req.category,
          title: req.title,
          description: req.description,
          required: true,
          status,
          artifact_url: status === 'approved' ? `https://example.com/evidence/${system.id}/${req.requirement_code}.pdf` : null,
          notes: '',
        })
      }
    }

    // Registry package (auto-create draft / ready).
    const requiredCount = spec.evidence ? ANNEX_IV_REQUIREMENTS.length : 0
    const approved = spec.evidence ? Math.max(0, spec.approvedCount - (spec.plantedGapIndex >= 0 ? 1 : 0)) : 0
    const readiness = requiredCount > 0 ? Math.round((approved / requiredCount) * 100) : 0
    const blocking: string[] = []
    if (spec.tier === 'high') {
      if (readiness < 100) blocking.push('Conformity-evidence readiness below 100%')
      if (spec.plantedGapIndex >= 0) blocking.push('Missing required Annex IV item')
    }
    await db.insert(registry_packages).values({
      system_id: system.id,
      user_id: userId,
      fields: { provider_name: spec.role === 'provider' ? spec.name : '', intended_purpose: spec.intended_purpose, member_states: spec.geographies },
      status: spec.registryStatus,
      readiness_pct: readiness,
      blocking_reasons: blocking,
    })

    // Transparency notice draft for the limited-risk chatbot (unpublished).
    if (spec.tier === 'limited') {
      await db.insert(transparency_notices).values({
        system_id: system.id,
        user_id: userId,
        trigger_code: 'chatbot',
        locale: 'en',
        version: 1,
        body: `You are chatting with an AI system operated by ${spec.name}. Responses are generated automatically.`,
        body_html: `<p>You are chatting with an AI system operated by <strong>${spec.name}</strong>. Responses are generated automatically.</p>`,
        published: false,
        created_by: userId,
      })
    }

    count++
  }
  return count
}

// POST /reset-demo — wipe this user's data and re-seed the sample portfolio.
router.post('/reset-demo', authMiddleware, async (c) => {
  const userId = getUserId(c)
  await deleteUserData(userId)
  const seeded = await seedUserDemo(userId)
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'reset_demo',
    entity_type: 'settings',
    entity_id: null,
    summary: `Reset demo data and re-seeded ${seeded} sample systems`,
    meta: { seeded },
  })
  return c.json({ success: true, seeded })
})

export default router
