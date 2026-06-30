import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  ai_systems,
  classifications,
  rule_hits,
  classification_answers,
  evidence_requirements,
  registry_packages,
  notifications,
  webhooks,
  webhook_deliveries,
  audit_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'
import { regenerateObligationsForSystem } from './obligations.js'

const router = new Hono()

// ===========================================================================
// Deterministic EU AI Act risk-tier classifier.
//
// The ruleset walks, in order of precedence:
//   1. Article 5 prohibited practices  -> tier "prohibited" (highest precedence)
//   2. Annex III high-risk categories  -> tier "high"
//      with the Article 6(3) derogation that can pull a candidate back down.
//   3. Article 50 transparency triggers -> tier "limited"
//   4. otherwise                         -> tier "minimal"
//
// Each fired rule produces a cited rule_hit (rule_code + article_ref + the
// question/answer that triggered it). The rationale array is the ordered set of
// hits that determined the final tier.
// ===========================================================================

export const RULESET_VERSION = '2024/1689-1.0'

type AnswerMap = Record<string, unknown>

function asBool(v: unknown): boolean {
  return v === true || v === 'true' || v === 'yes' || v === 1 || v === '1'
}

function asStr(v: unknown): string {
  return typeof v === 'string' ? v : v == null ? '' : String(v)
}

interface Question {
  key: string
  text: string
  type: 'boolean' | 'select' | 'text'
  options?: string[]
  group: string
  article_ref: string
  help?: string
}

// Full questionnaire definition. Answers are keyed by `key`.
const QUESTIONS: Question[] = [
  // --- Article 5: prohibited practices ---
  {
    key: 'subliminal_manipulation',
    text: 'Does the system use subliminal, manipulative or deceptive techniques that materially distort behaviour and cause significant harm?',
    type: 'boolean',
    group: 'Prohibited practices (Art. 5)',
    article_ref: 'Art. 5(1)(a)',
  },
  {
    key: 'exploits_vulnerabilities',
    text: 'Does it exploit vulnerabilities of a person or group (age, disability, social/economic situation) to materially distort behaviour?',
    type: 'boolean',
    group: 'Prohibited practices (Art. 5)',
    article_ref: 'Art. 5(1)(b)',
  },
  {
    key: 'social_scoring',
    text: 'Is it used for social scoring of natural persons leading to detrimental or unjustified treatment?',
    type: 'boolean',
    group: 'Prohibited practices (Art. 5)',
    article_ref: 'Art. 5(1)(c)',
  },
  {
    key: 'predictive_policing_profiling',
    text: 'Does it assess the risk of a person committing a criminal offence based solely on profiling?',
    type: 'boolean',
    group: 'Prohibited practices (Art. 5)',
    article_ref: 'Art. 5(1)(d)',
  },
  {
    key: 'facial_scraping',
    text: 'Does it build or expand facial recognition databases through untargeted scraping of images?',
    type: 'boolean',
    group: 'Prohibited practices (Art. 5)',
    article_ref: 'Art. 5(1)(e)',
  },
  {
    key: 'emotion_workplace_education',
    text: 'Does it infer emotions in the workplace or education institutions (outside medical/safety reasons)?',
    type: 'boolean',
    group: 'Prohibited practices (Art. 5)',
    article_ref: 'Art. 5(1)(f)',
  },
  {
    key: 'biometric_categorisation_sensitive',
    text: 'Does it categorise persons using biometrics to infer sensitive attributes (race, political views, etc.)?',
    type: 'boolean',
    group: 'Prohibited practices (Art. 5)',
    article_ref: 'Art. 5(1)(g)',
  },
  {
    key: 'realtime_remote_biometric_public',
    text: 'Is it real-time remote biometric identification in publicly accessible spaces for law enforcement (no qualifying exception)?',
    type: 'boolean',
    group: 'Prohibited practices (Art. 5)',
    article_ref: 'Art. 5(1)(h)',
  },

  // --- Annex III: high-risk categories ---
  {
    key: 'annex_iii_category',
    text: 'Which Annex III high-risk area best describes the intended purpose?',
    type: 'select',
    options: [
      'none',
      'biometrics',
      'critical_infrastructure',
      'education',
      'employment',
      'essential_services',
      'law_enforcement',
      'migration_asylum_border',
      'justice_democracy',
    ],
    group: 'High-risk (Annex III / Art. 6)',
    article_ref: 'Annex III',
  },
  {
    key: 'safety_component_regulated_product',
    text: 'Is the system a safety component of a product covered by Union harmonisation legislation (Annex I) requiring third-party conformity assessment?',
    type: 'boolean',
    group: 'High-risk (Annex III / Art. 6)',
    article_ref: 'Art. 6(1) / Annex I',
  },
  {
    key: 'art63_derogation',
    text: 'Does the system fall under an Article 6(3) derogation (narrow procedural task, improving a prior human activity, not replacing/influencing human assessment, preparatory only) AND does NOT profile?',
    type: 'boolean',
    group: 'High-risk (Annex III / Art. 6)',
    article_ref: 'Art. 6(3)',
    help: 'If yes, an Annex III system may be pulled back from high-risk unless it performs profiling.',
  },
  {
    key: 'performs_profiling',
    text: 'Does the system perform profiling of natural persons?',
    type: 'boolean',
    group: 'High-risk (Annex III / Art. 6)',
    article_ref: 'Art. 6(3)',
  },

  // --- Article 50: transparency triggers ---
  {
    key: 'interacts_with_humans',
    text: 'Does the system interact directly with natural persons (e.g. a chatbot)?',
    type: 'boolean',
    group: 'Transparency (Art. 50)',
    article_ref: 'Art. 50(1)',
  },
  {
    key: 'generates_synthetic_content',
    text: 'Does it generate synthetic audio, image, video or text content?',
    type: 'boolean',
    group: 'Transparency (Art. 50)',
    article_ref: 'Art. 50(2)',
  },
  {
    key: 'generates_deepfakes',
    text: 'Does it generate or manipulate deepfake image, audio or video content?',
    type: 'boolean',
    group: 'Transparency (Art. 50)',
    article_ref: 'Art. 50(4)',
  },
  {
    key: 'emotion_or_biometric_categorisation',
    text: 'Does it perform emotion recognition or biometric categorisation (permitted use)?',
    type: 'boolean',
    group: 'Transparency (Art. 50)',
    article_ref: 'Art. 50(3)',
  },
]

interface RuleHit {
  rule_code: string
  article_ref: string
  question: string
  answer: string
  contributes_to_tier: string
}

interface ClassifyResult {
  tier: 'prohibited' | 'high' | 'limited' | 'minimal'
  hits: RuleHit[]
  // coverage = fraction of questions answered (any value present)
  coverage_pct: number
  // article_50 trigger codes (for transparency-notice cascade)
  triggers: string[]
  // annex III category that fired, if any
  annexCategory?: string
}

function questionText(key: string): string {
  return QUESTIONS.find((q) => q.key === key)?.text ?? key
}

function articleRef(key: string): string {
  return QUESTIONS.find((q) => q.key === key)?.article_ref ?? ''
}

// The deterministic engine.
export function classify(answers: AnswerMap): ClassifyResult {
  const hits: RuleHit[] = []

  // ----- 1. Article 5 prohibited practices (highest precedence) -----
  const prohibitedKeys: Array<{ key: string; code: string }> = [
    { key: 'subliminal_manipulation', code: 'ART5_SUBLIMINAL' },
    { key: 'exploits_vulnerabilities', code: 'ART5_VULNERABILITIES' },
    { key: 'social_scoring', code: 'ART5_SOCIAL_SCORING' },
    { key: 'predictive_policing_profiling', code: 'ART5_PREDICTIVE_POLICING' },
    { key: 'facial_scraping', code: 'ART5_FACIAL_SCRAPING' },
    { key: 'emotion_workplace_education', code: 'ART5_EMOTION_WORK_EDU' },
    { key: 'biometric_categorisation_sensitive', code: 'ART5_BIOMETRIC_SENSITIVE' },
    { key: 'realtime_remote_biometric_public', code: 'ART5_RT_BIOMETRIC' },
  ]
  const prohibitedHits: RuleHit[] = []
  for (const { key, code } of prohibitedKeys) {
    if (asBool(answers[key])) {
      prohibitedHits.push({
        rule_code: code,
        article_ref: articleRef(key),
        question: questionText(key),
        answer: 'yes',
        contributes_to_tier: 'prohibited',
      })
    }
  }
  if (prohibitedHits.length > 0) {
    hits.push(...prohibitedHits)
    return {
      tier: 'prohibited',
      hits,
      coverage_pct: coverage(answers),
      triggers: [],
    }
  }

  // ----- 2. Annex III high-risk -----
  const annexCategory = asStr(answers['annex_iii_category'])
  const safetyComponent = asBool(answers['safety_component_regulated_product'])
  const isAnnexIII = (annexCategory && annexCategory !== 'none') || safetyComponent

  if (isAnnexIII) {
    const derogation = asBool(answers['art63_derogation'])
    const profiling = asBool(answers['performs_profiling'])

    // Safety components (Art 6(1)) cannot use the Annex III 6(3) derogation.
    const derogationApplies = derogation && !profiling && !safetyComponent

    if (safetyComponent) {
      hits.push({
        rule_code: 'ART6_SAFETY_COMPONENT',
        article_ref: 'Art. 6(1) / Annex I',
        question: questionText('safety_component_regulated_product'),
        answer: 'yes',
        contributes_to_tier: 'high',
      })
    }
    if (annexCategory && annexCategory !== 'none') {
      hits.push({
        rule_code: `ANNEX_III_${annexCategory.toUpperCase()}`,
        article_ref: 'Annex III',
        question: questionText('annex_iii_category'),
        answer: annexCategory,
        contributes_to_tier: 'high',
      })
    }

    if (derogationApplies) {
      // Pulled back from high-risk by the Article 6(3) derogation.
      hits.push({
        rule_code: 'ART6_3_DEROGATION',
        article_ref: 'Art. 6(3)',
        question: questionText('art63_derogation'),
        answer: 'yes',
        contributes_to_tier: 'limited',
      })
      // Fall through to transparency evaluation (the derogated system is not high-risk).
    } else {
      if (profiling) {
        hits.push({
          rule_code: 'ART6_3_PROFILING_OVERRIDE',
          article_ref: 'Art. 6(3)',
          question: questionText('performs_profiling'),
          answer: 'yes',
          contributes_to_tier: 'high',
        })
      }
      return {
        tier: 'high',
        hits,
        coverage_pct: coverage(answers),
        triggers: [],
        annexCategory: annexCategory && annexCategory !== 'none' ? annexCategory : undefined,
      }
    }
  }

  // ----- 3. Article 50 transparency triggers -> limited -----
  const triggerKeys: Array<{ key: string; code: string; trigger: string }> = [
    { key: 'interacts_with_humans', code: 'ART50_CHATBOT', trigger: 'chatbot' },
    { key: 'generates_synthetic_content', code: 'ART50_SYNTHETIC', trigger: 'synthetic_content' },
    { key: 'generates_deepfakes', code: 'ART50_DEEPFAKE', trigger: 'deepfake' },
    { key: 'emotion_or_biometric_categorisation', code: 'ART50_EMOTION', trigger: 'emotion_recognition' },
  ]
  const triggers: string[] = []
  const transparencyHits: RuleHit[] = []
  for (const { key, code, trigger } of triggerKeys) {
    if (asBool(answers[key])) {
      transparencyHits.push({
        rule_code: code,
        article_ref: articleRef(key),
        question: questionText(key),
        answer: 'yes',
        contributes_to_tier: 'limited',
      })
      triggers.push(trigger)
    }
  }
  if (transparencyHits.length > 0) {
    hits.push(...transparencyHits)
    return {
      tier: 'limited',
      hits,
      coverage_pct: coverage(answers),
      triggers,
    }
  }

  // ----- 4. minimal -----
  hits.push({
    rule_code: 'MINIMAL_DEFAULT',
    article_ref: 'Art. 95',
    question: 'No prohibited, high-risk or transparency triggers fired.',
    answer: 'n/a',
    contributes_to_tier: 'minimal',
  })
  return {
    tier: 'minimal',
    hits,
    coverage_pct: coverage(answers),
    triggers: [],
  }
}

function coverage(answers: AnswerMap): number {
  const total = QUESTIONS.length
  if (total === 0) return 0
  let answered = 0
  for (const q of QUESTIONS) {
    const v = answers[q.key]
    if (v !== undefined && v !== null && v !== '') answered++
  }
  return Math.round((answered / total) * 1000) / 10
}

// ---------------------------------------------------------------------------
// Evidence requirement templates (Annex IV) per tier.
// ---------------------------------------------------------------------------

interface EvidenceTemplate {
  requirement_code: string
  category: string
  title: string
  description: string
  required: boolean
}

const EVIDENCE_TEMPLATES: Record<string, EvidenceTemplate[]> = {
  high: [
    { requirement_code: 'EV_SYS_DESC', category: 'technical_documentation', title: 'General system description', description: 'Annex IV(1): intended purpose, developer, system architecture overview.', required: true },
    { requirement_code: 'EV_DEV_PROCESS', category: 'technical_documentation', title: 'Development process & design choices', description: 'Annex IV(2): methods, design specifications, key design choices.', required: true },
    { requirement_code: 'EV_DATA_SHEET', category: 'data_governance', title: 'Data sheets / data governance record', description: 'Annex IV(2)(d): training, validation and testing data provenance and characteristics.', required: true },
    { requirement_code: 'EV_RISK_ASSESSMENT', category: 'risk_management', title: 'Risk management documentation', description: 'Annex IV(3) / Art. 9: identified risks and mitigation measures.', required: true },
    { requirement_code: 'EV_ACCURACY_METRICS', category: 'performance', title: 'Accuracy, robustness & cybersecurity metrics', description: 'Annex IV(2)(g) / Art. 15: declared performance metrics and test results.', required: true },
    { requirement_code: 'EV_HUMAN_OVERSIGHT', category: 'human_oversight', title: 'Human oversight measures', description: 'Annex IV(2)(e) / Art. 14: oversight design and operator instructions.', required: true },
    { requirement_code: 'EV_LOGGING_DESC', category: 'logging', title: 'Logging capabilities description', description: 'Annex IV(2)(f) / Art. 12: automatic logging design.', required: true },
    { requirement_code: 'EV_INSTRUCTIONS', category: 'transparency', title: 'Instructions for use', description: 'Art. 13: instructions provided to deployers.', required: true },
    { requirement_code: 'EV_DOC', category: 'conformity', title: 'EU declaration of conformity', description: 'Art. 47: signed declaration of conformity.', required: true },
    { requirement_code: 'EV_POST_MARKET', category: 'monitoring', title: 'Post-market monitoring plan', description: 'Annex IV(8) / Art. 72: post-market monitoring system description.', required: true },
  ],
  limited: [
    { requirement_code: 'EV_DISCLOSURE', category: 'transparency', title: 'User-facing AI disclosure', description: 'Art. 50: evidence that users are informed they interact with / view AI-generated content.', required: true },
    { requirement_code: 'EV_LABELLING', category: 'transparency', title: 'Synthetic-content labelling', description: 'Art. 50(2): machine-readable marking of AI-generated outputs where applicable.', required: false },
  ],
  prohibited: [
    { requirement_code: 'EV_LEGAL_DETERMINATION', category: 'legal', title: 'Legal prohibition determination', description: 'Documented legal review of the Article 5 prohibited classification.', required: true },
  ],
  minimal: [
    { requirement_code: 'EV_DETERMINATION', category: 'legal', title: 'Minimal-risk determination record', description: 'Record of the assessment concluding the system is minimal-risk.', required: false },
  ],
}

const GPAI_EVIDENCE: EvidenceTemplate[] = [
  { requirement_code: 'EV_GPAI_TECH_DOC', category: 'gpai', title: 'GPAI technical documentation', description: 'Art. 53(1)(a): model documentation for the AI Office / downstream providers.', required: true },
  { requirement_code: 'EV_GPAI_TRAINING_SUMMARY', category: 'gpai', title: 'Training-content summary', description: 'Art. 53(1)(d): sufficiently detailed summary of training content.', required: true },
]

async function regenerateEvidenceForSystem(system: typeof ai_systems.$inferSelect, tier: string) {
  const userId = system.user_id
  const templates: EvidenceTemplate[] = [...(EVIDENCE_TEMPLATES[tier] ?? [])]
  if (system.is_gpai) templates.push(...GPAI_EVIDENCE)

  const existing = await db
    .select()
    .from(evidence_requirements)
    .where(eq(evidence_requirements.system_id, system.id))
  const byCode = new Map(existing.map((e) => [e.requirement_code, e]))
  const wantedCodes = new Set(templates.map((t) => t.requirement_code))

  for (const e of existing) {
    if (!wantedCodes.has(e.requirement_code)) {
      await db.delete(evidence_requirements).where(eq(evidence_requirements.id, e.id))
    }
  }

  for (const t of templates) {
    const prior = byCode.get(t.requirement_code)
    if (prior) {
      await db
        .update(evidence_requirements)
        .set({
          category: t.category,
          title: t.title,
          description: t.description,
          required: t.required,
          updated_at: new Date(),
        })
        .where(eq(evidence_requirements.id, prior.id))
    } else {
      await db.insert(evidence_requirements).values({
        system_id: system.id,
        user_id: userId,
        requirement_code: t.requirement_code,
        category: t.category,
        title: t.title,
        description: t.description,
        required: t.required,
        status: 'missing',
      })
    }
  }
}

// Recompute the registry package readiness for a system after a classification.
async function recomputeRegistry(system: typeof ai_systems.$inferSelect, tier: string) {
  const userId = system.user_id
  const [pkg] = await db
    .select()
    .from(registry_packages)
    .where(eq(registry_packages.system_id, system.id))

  // Only high-risk systems require registration; create/update a package for them.
  if (tier !== 'high') {
    if (pkg) {
      await db
        .update(registry_packages)
        .set({
          readiness_pct: 0,
          blocking_reasons: ['System is not high-risk; EU database registration not required.'],
          status: pkg.status === 'submitted' || pkg.status === 'registered' ? pkg.status : 'draft',
          updated_at: new Date(),
        })
        .where(eq(registry_packages.id, pkg.id))
    }
    return
  }

  // Compute readiness from evidence + required registry fields.
  const reqs = await db
    .select()
    .from(evidence_requirements)
    .where(eq(evidence_requirements.system_id, system.id))
  const required = reqs.filter((r) => r.required)
  const approved = required.filter((r) => r.status === 'approved')
  const evidenceReadiness = required.length === 0 ? 1 : approved.length / required.length

  const fields = (pkg?.fields ?? {}) as Record<string, unknown>
  const requiredFields = ['provider_name', 'contact', 'intended_purpose', 'member_states']
  const presentFields = requiredFields.filter((f) => fields[f] != null && fields[f] !== '')
  const fieldReadiness = presentFields.length / requiredFields.length

  const readiness = Math.round(((evidenceReadiness * 0.6 + fieldReadiness * 0.4) * 100) * 10) / 10

  const blocking: string[] = []
  for (const r of required) {
    if (r.status !== 'approved') blocking.push(`Evidence "${r.title}" is ${r.status}`)
  }
  for (const f of requiredFields) {
    if (!(fields[f] != null && fields[f] !== '')) blocking.push(`Registry field "${f}" is missing`)
  }

  if (pkg) {
    await db
      .update(registry_packages)
      .set({
        readiness_pct: readiness,
        blocking_reasons: blocking,
        updated_at: new Date(),
      })
      .where(eq(registry_packages.id, pkg.id))
  } else {
    await db.insert(registry_packages).values({
      system_id: system.id,
      user_id: userId,
      fields: {},
      status: 'draft',
      readiness_pct: readiness,
      blocking_reasons: blocking,
    })
  }
}

// Fire-and-forget webhook deliveries for subscribers of an event.
async function emitWebhooks(userId: string, event: string, payload: Record<string, unknown>) {
  try {
    const hooks = await db
      .select()
      .from(webhooks)
      .where(and(eq(webhooks.user_id, userId), eq(webhooks.active, true)))
    for (const h of hooks) {
      const events = Array.isArray(h.events) ? h.events : []
      if (!events.includes(event) && !events.includes('*')) continue
      let statusCode = 0
      let ok = false
      try {
        const res = await fetch(h.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': h.secret },
          body: JSON.stringify({ event, payload }),
        })
        statusCode = res.status
        ok = res.ok
      } catch {
        statusCode = 0
        ok = false
      }
      await db.insert(webhook_deliveries).values({
        webhook_id: h.id,
        event,
        payload,
        status_code: statusCode,
        ok,
      })
    }
  } catch {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// GET /questionnaire — current questionnaire definition
router.get('/questionnaire', (c) => {
  return c.json({ ruleset_version: RULESET_VERSION, questions: QUESTIONS })
})

// GET /:systemId — latest classification + rule_hits for a system
router.get('/:systemId', async (c) => {
  const systemId = c.req.param('systemId')
  const [classification] = await db
    .select()
    .from(classifications)
    .where(eq(classifications.system_id, systemId))
    .orderBy(desc(classifications.created_at))
    .limit(1)

  if (!classification) return c.json({ classification: null, rule_hits: [] })

  const hits = await db
    .select()
    .from(rule_hits)
    .where(eq(rule_hits.classification_id, classification.id))
    .orderBy(rule_hits.created_at)

  return c.json({ classification, rule_hits: hits })
})

// GET /:systemId/history — classification history
router.get('/:systemId/history', async (c) => {
  const systemId = c.req.param('systemId')
  const rows = await db
    .select()
    .from(classifications)
    .where(eq(classifications.system_id, systemId))
    .orderBy(desc(classifications.created_at))
  return c.json(rows)
})

const runSchema = z.object({
  answers: z.record(z.string(), z.unknown()).default({}),
})

// POST /:systemId/run — run deterministic classifier from answers
router.post('/:systemId/run', authMiddleware, zValidator('json', runSchema), async (c) => {
  const userId = getUserId(c)
  const systemId = c.req.param('systemId')
  const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, systemId))
  if (!system) return c.json({ error: 'Not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const { answers } = c.req.valid('json')
  const result = classify(answers)

  // 1. Write classification.
  const rationale = result.hits.map((h) => ({
    rule_code: h.rule_code,
    article_ref: h.article_ref,
    question: h.question,
    answer: h.answer,
  }))
  const [classification] = await db
    .insert(classifications)
    .values({
      system_id: systemId,
      tier: result.tier,
      ruleset_version: RULESET_VERSION,
      rationale,
      coverage_pct: result.coverage_pct,
      is_override: false,
      created_by: userId,
    })
    .returning()

  // 2. Write cited rule_hits.
  for (const h of result.hits) {
    await db.insert(rule_hits).values({
      classification_id: classification.id,
      rule_code: h.rule_code,
      article_ref: h.article_ref,
      question: h.question,
      answer: h.answer,
      contributes_to_tier: h.contributes_to_tier,
    })
  }

  // 3. Persist structured answers.
  for (const [key, value] of Object.entries(answers)) {
    await db.insert(classification_answers).values({
      system_id: systemId,
      classification_id: classification.id,
      question_key: key,
      answer: value as unknown,
    })
  }

  // 4. Update system tier + status.
  const [updatedSystem] = await db
    .update(ai_systems)
    .set({
      current_tier: result.tier,
      status: system.status === 'draft' ? 'classified' : system.status,
      updated_at: new Date(),
    })
    .where(eq(ai_systems.id, systemId))
    .returning()

  // 5. Cascade: regenerate obligations, evidence requirements, registry readiness.
  await regenerateObligationsForSystem(updatedSystem)
  await regenerateEvidenceForSystem(updatedSystem, result.tier)
  await recomputeRegistry(updatedSystem, result.tier)

  // 6. Notification + webhook.
  try {
    await db.insert(notifications).values({
      user_id: userId,
      type: 'classification',
      title: `System classified as ${result.tier}`,
      body: `"${updatedSystem.name}" was classified as ${result.tier} (ruleset ${RULESET_VERSION}).`,
      entity_type: 'system',
      entity_id: systemId,
    })
  } catch {
    // best-effort
  }
  await emitWebhooks(userId, 'classification.completed', {
    system_id: systemId,
    tier: result.tier,
    classification_id: classification.id,
  })

  // 7. Audit.
  try {
    await db.insert(audit_log).values({
      user_id: userId,
      action: 'classification.run',
      entity_type: 'system',
      entity_id: systemId,
      summary: `Classified "${updatedSystem.name}" as ${result.tier}`,
      meta: { tier: result.tier, coverage_pct: result.coverage_pct, triggers: result.triggers },
    })
  } catch {
    // best-effort
  }

  const hits = await db
    .select()
    .from(rule_hits)
    .where(eq(rule_hits.classification_id, classification.id))
    .orderBy(rule_hits.created_at)

  return c.json({ classification, rule_hits: hits }, 201)
})

const overrideSchema = z.object({
  tier: z.enum(['prohibited', 'high', 'limited', 'minimal']),
  justification: z.string().min(1),
})

// POST /:systemId/override — manual tier override with justification
router.post('/:systemId/override', authMiddleware, zValidator('json', overrideSchema), async (c) => {
  const userId = getUserId(c)
  const systemId = c.req.param('systemId')
  const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, systemId))
  if (!system) return c.json({ error: 'Not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const { tier, justification } = c.req.valid('json')

  const [classification] = await db
    .insert(classifications)
    .values({
      system_id: systemId,
      tier,
      ruleset_version: RULESET_VERSION,
      rationale: [
        {
          rule_code: 'MANUAL_OVERRIDE',
          article_ref: 'n/a',
          question: 'Manual tier override',
          answer: justification,
        },
      ],
      coverage_pct: 0,
      is_override: true,
      override_justification: justification,
      created_by: userId,
    })
    .returning()

  await db.insert(rule_hits).values({
    classification_id: classification.id,
    rule_code: 'MANUAL_OVERRIDE',
    article_ref: 'n/a',
    question: 'Manual tier override',
    answer: justification,
    contributes_to_tier: tier,
  })

  const [updatedSystem] = await db
    .update(ai_systems)
    .set({ current_tier: tier, status: system.status === 'draft' ? 'classified' : system.status, updated_at: new Date() })
    .where(eq(ai_systems.id, systemId))
    .returning()

  // Cascade obligations/evidence/registry to the overridden tier.
  await regenerateObligationsForSystem(updatedSystem)
  await regenerateEvidenceForSystem(updatedSystem, tier)
  await recomputeRegistry(updatedSystem, tier)

  try {
    await db.insert(notifications).values({
      user_id: userId,
      type: 'classification_override',
      title: `Tier manually overridden to ${tier}`,
      body: `"${updatedSystem.name}" tier was manually overridden to ${tier}.`,
      entity_type: 'system',
      entity_id: systemId,
    })
  } catch {
    // best-effort
  }
  await emitWebhooks(userId, 'classification.overridden', {
    system_id: systemId,
    tier,
    classification_id: classification.id,
  })

  try {
    await db.insert(audit_log).values({
      user_id: userId,
      action: 'classification.override',
      entity_type: 'system',
      entity_id: systemId,
      summary: `Overrode "${updatedSystem.name}" tier to ${tier}`,
      meta: { tier, justification },
    })
  } catch {
    // best-effort
  }

  return c.json(classification, 201)
})

export default router
