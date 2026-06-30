import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  ai_systems,
  classifications,
  rule_hits,
  classification_answers,
  obligations,
  evidence_requirements,
  notifications,
  audit_log,
} from '../db/schema.js'
import { eq, and, inArray } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const RULESET_VERSION = 'eu-ai-act-2024'

type Tier = 'prohibited' | 'high' | 'limited' | 'minimal'

interface RuleHit {
  rule_code: string
  article_ref: string
  question: string
  answer: string
  contributes_to_tier: Tier
}

// Deterministic EU AI Act classifier. Walks Article 5 (prohibited),
// Annex III high-risk categories, Article 50 transparency triggers, else minimal.
// Operates over a system row merged with optional questionnaire answers.
function classifySystem(
  system: typeof ai_systems.$inferSelect,
  answers: Record<string, unknown>,
): { tier: Tier; hits: RuleHit[]; rationale: RuleHit[]; coverage: number } {
  const hits: RuleHit[] = []
  const ans = (k: string): boolean => answers[k] === true || answers[k] === 'yes'
  const purpose = (system.purpose_category || '').toLowerCase()
  const intended = (system.intended_purpose || '').toLowerCase()
  const text = `${purpose} ${intended} ${(system.description || '').toLowerCase()}`

  // --- Article 5: prohibited practices ---
  const prohibitedSignals: Array<{ code: string; q: string; on: boolean }> = [
    { code: 'art5_social_scoring', q: 'Performs social scoring of natural persons?', on: ans('social_scoring') || text.includes('social scoring') },
    { code: 'art5_subliminal', q: 'Uses subliminal or manipulative techniques?', on: ans('subliminal_manipulation') || text.includes('subliminal') },
    { code: 'art5_biometric_categorization', q: 'Untargeted scraping for biometric categorization of sensitive traits?', on: ans('biometric_scraping') },
    { code: 'art5_realtime_rbi', q: 'Real-time remote biometric identification in public spaces for law enforcement?', on: ans('realtime_remote_biometric') },
  ]
  for (const s of prohibitedSignals) {
    if (s.on) {
      hits.push({ rule_code: s.code, article_ref: 'Article 5', question: s.q, answer: 'yes', contributes_to_tier: 'prohibited' })
    }
  }
  if (hits.some((h) => h.contributes_to_tier === 'prohibited')) {
    return { tier: 'prohibited', hits, rationale: hits, coverage: 1 }
  }

  // --- Annex III: high-risk categories ---
  const annexIII: Array<{ code: string; q: string; on: boolean }> = [
    { code: 'annex3_biometrics', q: 'Biometric identification/categorization (Annex III.1)?', on: ans('annex_biometrics') || purpose.includes('biometric') },
    { code: 'annex3_critical_infra', q: 'Safety component of critical infrastructure (Annex III.2)?', on: ans('annex_critical_infrastructure') || text.includes('critical infrastructure') },
    { code: 'annex3_education', q: 'Education / vocational training access or evaluation (Annex III.3)?', on: ans('annex_education') || purpose.includes('education') },
    { code: 'annex3_employment', q: 'Employment, worker management, recruitment (Annex III.4)?', on: ans('annex_employment') || purpose.includes('employment') || purpose.includes('recruit') },
    { code: 'annex3_essential_services', q: 'Access to essential private/public services & benefits (Annex III.5)?', on: ans('annex_essential_services') || text.includes('credit') || text.includes('benefits') },
    { code: 'annex3_law_enforcement', q: 'Law enforcement use (Annex III.6)?', on: ans('annex_law_enforcement') || purpose.includes('law enforcement') },
    { code: 'annex3_migration', q: 'Migration, asylum, border control (Annex III.7)?', on: ans('annex_migration') || purpose.includes('migration') || purpose.includes('border') },
    { code: 'annex3_justice', q: 'Administration of justice & democratic processes (Annex III.8)?', on: ans('annex_justice') || purpose.includes('justice') },
  ]
  const annexHits = annexIII.filter((s) => s.on)
  for (const s of annexHits) {
    hits.push({ rule_code: s.code, article_ref: 'Annex III', question: s.q, answer: 'yes', contributes_to_tier: 'high' })
  }
  if (annexHits.length > 0) {
    // Article 6(3) derogation: purely preparatory / narrow procedural task can drop to limited.
    const derogation = ans('art6_3_derogation')
    if (derogation) {
      hits.push({
        rule_code: 'art6_3_derogation',
        article_ref: 'Article 6(3)',
        question: 'Performs a narrow procedural / preparatory task only (derogation)?',
        answer: 'yes',
        contributes_to_tier: 'limited',
      })
    } else {
      return { tier: 'high', hits, rationale: hits, coverage: 1 }
    }
  }

  // --- Article 50: transparency triggers → limited ---
  const art50: Array<{ code: string; q: string; on: boolean }> = [
    { code: 'art50_chatbot', q: 'Interacts directly with natural persons (chatbot)?', on: ans('interacts_with_humans') || system.modality === 'conversational' || text.includes('chatbot') },
    { code: 'art50_synthetic', q: 'Generates synthetic audio/image/video/text content?', on: ans('generates_synthetic_content') || system.modality === 'generative' },
    { code: 'art50_deepfake', q: 'Produces deep-fake content?', on: ans('produces_deepfakes') || text.includes('deepfake') },
    { code: 'art50_emotion', q: 'Emotion recognition or biometric categorization (notice duty)?', on: ans('emotion_recognition') || text.includes('emotion') },
  ]
  const art50Hits = art50.filter((s) => s.on)
  for (const s of art50Hits) {
    hits.push({ rule_code: s.code, article_ref: 'Article 50', question: s.q, answer: 'yes', contributes_to_tier: 'limited' })
  }
  if (art50Hits.length > 0) {
    return { tier: 'limited', hits, rationale: hits, coverage: 1 }
  }

  // --- Default: minimal risk ---
  hits.push({
    rule_code: 'minimal_default',
    article_ref: 'Recital 165',
    question: 'No prohibited, high-risk, or transparency trigger matched.',
    answer: 'minimal',
    contributes_to_tier: 'minimal',
  })
  return { tier: 'minimal', hits, rationale: hits, coverage: 1 }
}

// Obligation templates keyed by tier.
function obligationTemplates(tier: Tier): Array<{ code: string; article: string; title: string; description: string; reason: string }> {
  if (tier === 'prohibited') {
    return [
      { code: 'prohibited_cease', article: 'Article 5', title: 'Cease prohibited practice', description: 'The system falls under a prohibited practice and must not be placed on the market or put into service.', reason: 'Classified prohibited under Article 5.' },
    ]
  }
  if (tier === 'high') {
    return [
      { code: 'risk_mgmt', article: 'Article 9', title: 'Establish risk-management system', description: 'Continuous iterative risk-management process across the lifecycle.', reason: 'High-risk under Annex III.' },
      { code: 'data_governance', article: 'Article 10', title: 'Data and data governance', description: 'Training, validation and testing data sets meet quality criteria.', reason: 'High-risk under Annex III.' },
      { code: 'technical_docs', article: 'Article 11', title: 'Technical documentation (Annex IV)', description: 'Draw up and maintain technical documentation before placing on market.', reason: 'High-risk under Annex III.' },
      { code: 'record_keeping', article: 'Article 12', title: 'Logging / record-keeping', description: 'Automatic recording of events over the system lifetime.', reason: 'High-risk under Annex III.' },
      { code: 'transparency', article: 'Article 13', title: 'Transparency & instructions for use', description: 'Provide instructions enabling deployers to interpret and use output.', reason: 'High-risk under Annex III.' },
      { code: 'human_oversight', article: 'Article 14', title: 'Human oversight', description: 'Design for effective oversight by natural persons.', reason: 'High-risk under Annex III.' },
      { code: 'accuracy_robustness', article: 'Article 15', title: 'Accuracy, robustness & cybersecurity', description: 'Appropriate levels of accuracy, robustness and cybersecurity.', reason: 'High-risk under Annex III.' },
      { code: 'conformity', article: 'Article 43', title: 'Conformity assessment', description: 'Undergo the relevant conformity-assessment procedure.', reason: 'High-risk under Annex III.' },
      { code: 'registration', article: 'Article 49', title: 'EU database registration', description: 'Register the system in the EU database before placing on market.', reason: 'High-risk under Annex III.' },
    ]
  }
  if (tier === 'limited') {
    return [
      { code: 'art50_notice', article: 'Article 50', title: 'Transparency notice to users', description: 'Inform natural persons that they interact with / receive AI-generated content.', reason: 'Limited-risk transparency trigger under Article 50.' },
      { code: 'art50_marking', article: 'Article 50', title: 'Mark synthetic content', description: 'Mark AI-generated or manipulated content in a machine-readable format.', reason: 'Limited-risk transparency trigger under Article 50.' },
    ]
  }
  return [
    { code: 'voluntary_coc', article: 'Article 95', title: 'Voluntary code of conduct', description: 'Consider adhering to voluntary codes of conduct for minimal-risk systems.', reason: 'Minimal risk.' },
  ]
}

function evidenceTemplates(tier: Tier): Array<{ code: string; category: string; title: string; required: boolean }> {
  if (tier === 'high') {
    return [
      { code: 'annex4_general', category: 'technical_documentation', title: 'General system description (Annex IV.1)', required: true },
      { code: 'annex4_design', category: 'technical_documentation', title: 'Detailed design specifications (Annex IV.2)', required: true },
      { code: 'annex4_monitoring', category: 'technical_documentation', title: 'Monitoring, functioning & control (Annex IV.3)', required: true },
      { code: 'annex4_risk', category: 'risk', title: 'Risk-management documentation (Annex IV.4)', required: true },
      { code: 'annex4_changes', category: 'technical_documentation', title: 'Changes through lifecycle (Annex IV.6)', required: true },
      { code: 'doc_conformity', category: 'conformity', title: 'EU declaration of conformity', required: true },
      { code: 'data_sheets', category: 'data', title: 'Data governance & datasheet evidence', required: true },
    ]
  }
  if (tier === 'limited') {
    return [
      { code: 'notice_text', category: 'transparency', title: 'Published transparency notice text', required: true },
      { code: 'marking_proof', category: 'transparency', title: 'Synthetic-content marking proof', required: false },
    ]
  }
  if (tier === 'prohibited') {
    return [{ code: 'cessation_record', category: 'governance', title: 'Record of cessation / non-placement', required: true }]
  }
  return [{ code: 'voluntary_record', category: 'governance', title: 'Voluntary measures record', required: false }]
}

// Re-run classifier for one owned system; persists classification + rule_hits +
// answers, updates the system tier/status, and regenerates obligations + evidence
// (preserving existing obligation/evidence status by template/requirement code).
async function reclassifyOne(
  system: typeof ai_systems.$inferSelect,
  userId: string,
  answers: Record<string, unknown>,
): Promise<Tier> {
  const merged: Record<string, unknown> = { ...answers }
  const result = classifySystem(system, merged)

  const [cls] = await db
    .insert(classifications)
    .values({
      system_id: system.id,
      tier: result.tier,
      ruleset_version: RULESET_VERSION,
      rationale: result.rationale.map((h) => ({ rule_code: h.rule_code, article_ref: h.article_ref, question: h.question, answer: h.answer })),
      coverage_pct: result.coverage,
      is_override: false,
      created_by: userId,
    })
    .returning()

  for (const h of result.hits) {
    await db.insert(rule_hits).values({
      classification_id: cls.id,
      rule_code: h.rule_code,
      article_ref: h.article_ref,
      question: h.question,
      answer: h.answer,
      contributes_to_tier: h.contributes_to_tier,
    })
  }

  if (Object.keys(merged).length > 0) {
    for (const [key, value] of Object.entries(merged)) {
      await db.insert(classification_answers).values({
        system_id: system.id,
        classification_id: cls.id,
        question_key: key,
        answer: value,
      })
    }
  }

  await db
    .update(ai_systems)
    .set({ current_tier: result.tier, status: 'classified', updated_at: new Date() })
    .where(eq(ai_systems.id, system.id))

  // Regenerate obligations: preserve status for matching template codes.
  const existingObl = await db.select().from(obligations).where(eq(obligations.system_id, system.id))
  const oblStatusByCode = new Map(existingObl.map((o) => [o.template_code, { status: o.status, owner: o.owner, due_date: o.due_date, evidence_links: o.evidence_links }]))
  await db.delete(obligations).where(eq(obligations.system_id, system.id))
  for (const t of obligationTemplates(result.tier)) {
    const prev = oblStatusByCode.get(t.code)
    await db.insert(obligations).values({
      system_id: system.id,
      user_id: userId,
      tier: result.tier,
      article_ref: t.article,
      title: t.title,
      description: t.description,
      applicability_reason: t.reason,
      template_code: t.code,
      owner: prev?.owner ?? null,
      due_date: prev?.due_date ?? null,
      status: prev?.status ?? 'not_started',
      evidence_links: prev?.evidence_links ?? [],
    })
  }

  // Regenerate evidence requirements: preserve status/artifact for matching codes.
  const existingEv = await db.select().from(evidence_requirements).where(eq(evidence_requirements.system_id, system.id))
  const evByCode = new Map(existingEv.map((e) => [e.requirement_code, e]))
  await db.delete(evidence_requirements).where(eq(evidence_requirements.system_id, system.id))
  for (const t of evidenceTemplates(result.tier)) {
    const prev = evByCode.get(t.code)
    await db.insert(evidence_requirements).values({
      system_id: system.id,
      user_id: userId,
      requirement_code: t.code,
      category: t.category,
      title: t.title,
      required: t.required,
      status: prev?.status ?? 'missing',
      artifact_url: prev?.artifact_url ?? null,
      artifact_meta: prev?.artifact_meta ?? {},
      reviewer: prev?.reviewer ?? null,
      notes: prev?.notes ?? '',
    })
  }

  await db.insert(notifications).values({
    user_id: userId,
    type: 'classification',
    title: `Reclassified: ${system.name}`,
    body: `System "${system.name}" reclassified as ${result.tier} risk.`,
    entity_type: 'ai_system',
    entity_id: system.id,
  })

  return result.tier
}

const reclassifySchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  answers: z.record(z.string(), z.unknown()).optional(),
})

// Auth-gated: bulk re-run classifier on a set of owned systems.
router.post('/reclassify', authMiddleware, zValidator('json', reclassifySchema), async (c) => {
  const userId = getUserId(c)
  const { ids, answers } = c.req.valid('json')
  const owned = await db
    .select()
    .from(ai_systems)
    .where(and(inArray(ai_systems.id, ids), eq(ai_systems.user_id, userId)))
  let updated = 0
  for (const system of owned) {
    await reclassifyOne(system, userId, answers ?? {})
    updated++
  }
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'bulk_reclassify',
    entity_type: 'ai_system',
    entity_id: null,
    summary: `Bulk reclassified ${updated} system(s)`,
    meta: { ids: owned.map((s) => s.id) },
  })
  return c.json({ updated })
})

const bulkSystemsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  patch: z
    .object({
      owner: z.string().optional(),
      status: z.enum(['draft', 'classified', 'under_review', 'registered']).optional(),
    })
    .refine((p) => p.owner !== undefined || p.status !== undefined, { message: 'patch must set owner or status' }),
})

// Auth-gated: bulk set owner/status on owned systems.
// owner is recorded on the system's open obligations (systems have no owner column).
router.post('/systems', authMiddleware, zValidator('json', bulkSystemsSchema), async (c) => {
  const userId = getUserId(c)
  const { ids, patch } = c.req.valid('json')
  const owned = await db
    .select()
    .from(ai_systems)
    .where(and(inArray(ai_systems.id, ids), eq(ai_systems.user_id, userId)))
  const ownedIds = owned.map((s) => s.id)
  if (ownedIds.length === 0) return c.json({ updated: 0 })

  if (patch.status !== undefined) {
    await db
      .update(ai_systems)
      .set({ status: patch.status, updated_at: new Date() })
      .where(and(inArray(ai_systems.id, ownedIds), eq(ai_systems.user_id, userId)))
  } else {
    await db
      .update(ai_systems)
      .set({ updated_at: new Date() })
      .where(and(inArray(ai_systems.id, ownedIds), eq(ai_systems.user_id, userId)))
  }

  if (patch.owner !== undefined) {
    await db
      .update(obligations)
      .set({ owner: patch.owner, updated_at: new Date() })
      .where(and(inArray(obligations.system_id, ownedIds), eq(obligations.user_id, userId)))
  }

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'bulk_update',
    entity_type: 'ai_system',
    entity_id: null,
    summary: `Bulk updated ${ownedIds.length} system(s)`,
    meta: { ids: ownedIds, patch },
  })
  return c.json({ updated: ownedIds.length })
})

const bulkObligationsSchema = z.object({
  ids: z.array(z.string().min(1)).min(1),
  status: z.enum(['not_started', 'in_progress', 'blocked', 'complete', 'not_applicable']),
})

// Auth-gated: bulk update status on owned obligations.
router.post('/obligations', authMiddleware, zValidator('json', bulkObligationsSchema), async (c) => {
  const userId = getUserId(c)
  const { ids, status } = c.req.valid('json')
  const owned = await db
    .select()
    .from(obligations)
    .where(and(inArray(obligations.id, ids), eq(obligations.user_id, userId)))
  const ownedIds = owned.map((o) => o.id)
  if (ownedIds.length === 0) return c.json({ updated: 0 })
  await db
    .update(obligations)
    .set({ status, updated_at: new Date() })
    .where(and(inArray(obligations.id, ownedIds), eq(obligations.user_id, userId)))
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'bulk_update',
    entity_type: 'obligation',
    entity_id: null,
    summary: `Bulk set ${ownedIds.length} obligation(s) to ${status}`,
    meta: { ids: ownedIds, status },
  })
  return c.json({ updated: ownedIds.length })
})

export default router
