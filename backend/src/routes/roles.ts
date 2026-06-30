import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  ai_systems,
  role_events,
  obligations,
  notifications,
  audit_log,
} from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const RULESET_VERSION = 'eu-ai-act-2024.1'

// Roles recognised by the engine (Art. 3 definitions).
const ROLES = ['provider', 'deployer', 'importer', 'distributor', 'product_manufacturer'] as const
type Role = (typeof ROLES)[number]

// Event types that the role-reasoning engine understands (Art. 25 — value-chain
// responsibilities / substantial modification).
const EVENT_TYPES = ['rebrand', 'substantial_modification', 'purpose_change', 'finetune'] as const

const roleEventSchema = z.object({
  event_type: z.enum(EVENT_TYPES),
  description: z.string().optional().default(''),
  // The role the operator believes they should hold AFTER the event. Optional —
  // when omitted the engine derives it from event_type per Art. 25(1).
  proposed_role: z.enum(ROLES).optional(),
})

// ---------------------------------------------------------------------------
// Role-derivation engine (Article 25 — responsibilities along the AI value chain)
// ---------------------------------------------------------------------------
//
// Art. 25(1): a distributor, importer, deployer or other third party is
// considered a PROVIDER of a high-risk system (and assumes provider obligations)
// where they:
//   (a) put their name/trademark on an already-placed system  -> rebrand
//   (b) make a substantial modification                        -> substantial_modification
//   (c) modify the intended purpose of a system                -> purpose_change
// A material fine-tune of a GPAI / high-risk model is treated as a substantial
// modification for the purposes of this engine.
function deriveAfterRole(beforeRole: Role, eventType: string, proposed?: Role): Role {
  if (proposed) return proposed
  switch (eventType) {
    case 'rebrand':
    case 'substantial_modification':
    case 'purpose_change':
    case 'finetune':
      // Any of these flip a non-provider operator into a provider.
      return beforeRole === 'provider' ? 'provider' : 'provider'
    default:
      return beforeRole
  }
}

// A "flip" worth flagging is specifically a deployer (or other downstream party)
// becoming a provider — that is the obligation-bearing transition under Art. 25.
function isProviderFlip(before: Role, after: Role): boolean {
  return before !== 'provider' && after === 'provider'
}

// Deterministic obligation template set keyed by tier. Mirrors the classifier's
// generator so a role flip that newly imposes provider obligations regenerates a
// consistent checklist. Provider flips are most material for high-risk systems.
function obligationTemplates(tier: string): Array<{
  template_code: string
  article_ref: string
  title: string
  description: string
  applicability_reason: string
}> {
  if (tier === 'high') {
    return [
      { template_code: 'rms', article_ref: 'Art. 9', title: 'Risk management system', description: 'Establish, implement, document and maintain a risk management system across the lifecycle.', applicability_reason: 'High-risk provider obligation (Art. 9).' },
      { template_code: 'data_governance', article_ref: 'Art. 10', title: 'Data and data governance', description: 'Apply data-governance practices to training, validation and testing datasets.', applicability_reason: 'High-risk provider obligation (Art. 10).' },
      { template_code: 'technical_documentation', article_ref: 'Art. 11', title: 'Technical documentation', description: 'Draw up Annex IV technical documentation before placing on the market.', applicability_reason: 'High-risk provider obligation (Art. 11).' },
      { template_code: 'record_keeping', article_ref: 'Art. 12', title: 'Logging and record-keeping', description: 'Enable automatic recording of events (logs) over the system lifetime.', applicability_reason: 'High-risk provider obligation (Art. 12).' },
      { template_code: 'transparency_users', article_ref: 'Art. 13', title: 'Transparency and provision of information to deployers', description: 'Provide instructions for use enabling deployers to interpret and use output.', applicability_reason: 'High-risk provider obligation (Art. 13).' },
      { template_code: 'human_oversight', article_ref: 'Art. 14', title: 'Human oversight', description: 'Design the system so it can be effectively overseen by natural persons.', applicability_reason: 'High-risk provider obligation (Art. 14).' },
      { template_code: 'accuracy_robustness', article_ref: 'Art. 15', title: 'Accuracy, robustness and cybersecurity', description: 'Achieve appropriate levels of accuracy, robustness and cybersecurity.', applicability_reason: 'High-risk provider obligation (Art. 15).' },
      { template_code: 'qms', article_ref: 'Art. 17', title: 'Quality management system', description: 'Put a quality management system in place.', applicability_reason: 'High-risk provider obligation (Art. 17).' },
      { template_code: 'conformity_assessment', article_ref: 'Art. 43', title: 'Conformity assessment', description: 'Undergo the relevant conformity assessment procedure before market placement.', applicability_reason: 'High-risk provider obligation (Art. 43).' },
      { template_code: 'eu_registration', article_ref: 'Art. 49', title: 'EU database registration', description: 'Register the high-risk system in the EU database.', applicability_reason: 'High-risk provider obligation (Art. 49).' },
    ]
  }
  if (tier === 'limited') {
    return [
      { template_code: 'transparency_art50', article_ref: 'Art. 50', title: 'Transparency obligations', description: 'Inform natural persons that they are interacting with an AI system / disclose synthetic content.', applicability_reason: 'Limited-risk transparency obligation (Art. 50).' },
    ]
  }
  if (tier === 'prohibited') {
    return [
      { template_code: 'cease_use', article_ref: 'Art. 5', title: 'Prohibited practice — cease and remediate', description: 'The practice is prohibited under Art. 5; withdraw or redesign before any deployment.', applicability_reason: 'Prohibited practice (Art. 5).' },
    ]
  }
  // minimal
  return [
    { template_code: 'voluntary_coc', article_ref: 'Art. 95', title: 'Voluntary code of conduct', description: 'Optional adherence to voluntary codes of conduct for minimal-risk systems.', applicability_reason: 'Minimal-risk — no mandatory obligations.' },
  ]
}

// Regenerate obligations for a system, preserving status/owner/due_date for
// template codes that still apply. Returns the fresh obligation rows.
async function regenerateObligationsForSystem(systemId: string, userId: string, tier: string) {
  const existing = await db.select().from(obligations).where(eq(obligations.system_id, systemId))
  const byCode = new Map(existing.map((o) => [o.template_code, o]))
  const templates = obligationTemplates(tier)
  const keepCodes = new Set(templates.map((t) => t.template_code))

  // Remove obligations that no longer apply under the new tier.
  for (const o of existing) {
    if (!keepCodes.has(o.template_code)) {
      await db.delete(obligations).where(eq(obligations.id, o.id))
    }
  }

  const result = []
  for (const t of templates) {
    const prev = byCode.get(t.template_code)
    if (prev) {
      const [updated] = await db
        .update(obligations)
        .set({
          tier,
          article_ref: t.article_ref,
          title: t.title,
          description: t.description,
          applicability_reason: t.applicability_reason,
          updated_at: new Date(),
        })
        .where(eq(obligations.id, prev.id))
        .returning()
      result.push(updated)
    } else {
      const [created] = await db
        .insert(obligations)
        .values({
          system_id: systemId,
          user_id: userId,
          tier,
          article_ref: t.article_ref,
          title: t.title,
          description: t.description,
          applicability_reason: t.applicability_reason,
          template_code: t.template_code,
          status: 'not_started',
        })
        .returning()
      result.push(created)
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// GET /system/:systemId — role-change log for one system (public read)
// ---------------------------------------------------------------------------
router.get('/system/:systemId', async (c) => {
  const systemId = c.req.param('systemId')
  const events = await db
    .select()
    .from(role_events)
    .where(eq(role_events.system_id, systemId))
    .orderBy(desc(role_events.created_at))
  return c.json(events)
})

// ---------------------------------------------------------------------------
// GET / — all role events for the current user (public read, user-scoped)
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([])
  const events = await db
    .select()
    .from(role_events)
    .where(eq(role_events.user_id, userId))
    .orderBy(desc(role_events.created_at))
  return c.json(events)
})

// ---------------------------------------------------------------------------
// POST /system/:systemId — record a role event, re-derive the effective role,
// flag a deployer->provider flip, and regenerate obligations on flip.
// ---------------------------------------------------------------------------
router.post('/system/:systemId', authMiddleware, zValidator('json', roleEventSchema), async (c) => {
  const userId = getUserId(c)
  const systemId = c.req.param('systemId')
  const body = c.req.valid('json')

  const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, systemId))
  if (!system) return c.json({ error: 'Not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const beforeRole = system.role as Role
  const afterRole = deriveAfterRole(beforeRole, body.event_type, body.proposed_role)
  const flipped = isProviderFlip(beforeRole, afterRole)

  const [event] = await db
    .insert(role_events)
    .values({
      system_id: systemId,
      user_id: userId,
      event_type: body.event_type,
      description: body.description,
      before_role: beforeRole,
      after_role: afterRole,
      flipped,
      created_by: userId,
    })
    .returning()

  let updatedSystem = system
  let regenerated: Awaited<ReturnType<typeof regenerateObligationsForSystem>> = []

  if (afterRole !== beforeRole) {
    const [u] = await db
      .update(ai_systems)
      .set({ role: afterRole, updated_at: new Date() })
      .where(eq(ai_systems.id, systemId))
      .returning()
    updatedSystem = u
  }

  if (flipped) {
    // A deployer (etc.) that becomes a provider inherits the full provider
    // obligation set for the system's current tier. Regenerate the checklist.
    const tier = system.current_tier ?? 'high'
    regenerated = await regenerateObligationsForSystem(systemId, userId, tier)

    await db.insert(notifications).values({
      user_id: userId,
      type: 'role_flip',
      title: 'Role flip detected: now a provider',
      body: `"${system.name}" flipped from ${beforeRole} to provider after a ${body.event_type} event. Provider obligations (${tier} tier) were regenerated.`,
      entity_type: 'ai_system',
      entity_id: systemId,
    })
  }

  await db.insert(audit_log).values({
    user_id: userId,
    action: flipped ? 'role_flip' : 'role_event',
    entity_type: 'ai_system',
    entity_id: systemId,
    summary: `${body.event_type}: ${beforeRole} -> ${afterRole}${flipped ? ' (provider flip)' : ''}`,
    meta: { ruleset_version: RULESET_VERSION, event_id: event.id, regenerated: regenerated.length },
  })

  return c.json({
    role_event: event,
    flipped,
    system: updatedSystem,
    obligations: regenerated,
  })
})

export default router
