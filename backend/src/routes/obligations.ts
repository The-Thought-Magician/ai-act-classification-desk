import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { ai_systems, obligations, audit_log } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// ---------------------------------------------------------------------------
// Deterministic obligation templates keyed by risk tier + (sometimes) role.
// Mirrors the EU AI Act obligation set the classifier cascades into. The same
// template table is used by classify.ts when it regenerates obligations after a
// run; here it is exposed for explicit regeneration and per-tier listing.
// ---------------------------------------------------------------------------

export interface ObligationTemplate {
  template_code: string
  article_ref: string
  title: string
  description: string
  // roles this obligation applies to; empty = all roles
  roles: string[]
  applicability_reason: string
}

const OBLIGATION_TEMPLATES: Record<string, ObligationTemplate[]> = {
  prohibited: [
    {
      template_code: 'PROH_CEASE',
      article_ref: 'Art. 5',
      title: 'Cease placing on the market / withdraw practice',
      description:
        'This practice is prohibited under Article 5. It may not be placed on the EU market or put into service. Withdraw or redesign before any deployment.',
      roles: [],
      applicability_reason: 'System matched an Article 5 prohibited-practice rule.',
    },
    {
      template_code: 'PROH_LEGAL_REVIEW',
      article_ref: 'Art. 5',
      title: 'Obtain legal sign-off on prohibition assessment',
      description:
        'Document a legal review confirming the prohibited classification or the basis for any claimed exemption (e.g. narrow law-enforcement derogations).',
      roles: [],
      applicability_reason: 'Prohibited classifications require a documented legal determination.',
    },
  ],
  high: [
    {
      template_code: 'HIGH_RMS',
      article_ref: 'Art. 9',
      title: 'Establish a risk management system',
      description:
        'Implement, document and maintain a continuous risk management system across the system lifecycle (Article 9).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk providers must operate a risk management system.',
    },
    {
      template_code: 'HIGH_DATA_GOV',
      article_ref: 'Art. 10',
      title: 'Data and data governance controls',
      description:
        'Ensure training, validation and testing data sets meet quality criteria and document data governance practices (Article 10).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk systems require documented data governance.',
    },
    {
      template_code: 'HIGH_TECH_DOC',
      article_ref: 'Art. 11 / Annex IV',
      title: 'Technical documentation (Annex IV)',
      description:
        'Draw up and keep up to date the technical documentation set out in Annex IV before placing on the market (Article 11).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'Annex IV technical documentation is mandatory for high-risk systems.',
    },
    {
      template_code: 'HIGH_LOGGING',
      article_ref: 'Art. 12',
      title: 'Automatic record-keeping (logging)',
      description: 'Enable automatic logging of events over the system lifetime (Article 12).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk systems must support event logging.',
    },
    {
      template_code: 'HIGH_TRANSPARENCY',
      article_ref: 'Art. 13',
      title: 'Transparency and instructions for use',
      description:
        'Provide deployers with clear instructions for use and information enabling them to interpret outputs (Article 13).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk providers must supply instructions for use.',
    },
    {
      template_code: 'HIGH_HUMAN_OVERSIGHT',
      article_ref: 'Art. 14',
      title: 'Human oversight measures',
      description: 'Design the system so it can be effectively overseen by natural persons (Article 14).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk systems require human oversight by design.',
    },
    {
      template_code: 'HIGH_ACCURACY',
      article_ref: 'Art. 15',
      title: 'Accuracy, robustness and cybersecurity',
      description:
        'Achieve appropriate levels of accuracy, robustness and cybersecurity and declare them (Article 15).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk systems must meet accuracy and robustness requirements.',
    },
    {
      template_code: 'HIGH_QMS',
      article_ref: 'Art. 17',
      title: 'Quality management system',
      description: 'Put a quality management system in place covering compliance procedures (Article 17).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk providers must maintain a quality management system.',
    },
    {
      template_code: 'HIGH_CONFORMITY',
      article_ref: 'Art. 43 / Art. 47',
      title: 'Conformity assessment and EU declaration',
      description:
        'Complete the conformity assessment, draw up the EU declaration of conformity and affix CE marking (Articles 43, 47, 48).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk systems must undergo conformity assessment before market placement.',
    },
    {
      template_code: 'HIGH_REGISTRATION',
      article_ref: 'Art. 49',
      title: 'Register in the EU database',
      description: 'Register the high-risk system in the EU database before placing it on the market (Article 49).',
      roles: ['provider', 'product_manufacturer'],
      applicability_reason: 'High-risk standalone systems must be registered in the EU database.',
    },
    {
      template_code: 'HIGH_DEPLOYER_USE',
      article_ref: 'Art. 26',
      title: 'Deployer obligations: use per instructions',
      description:
        'Use the high-risk system in accordance with the instructions, assign competent human oversight and monitor operation (Article 26).',
      roles: ['deployer'],
      applicability_reason: 'Deployers of high-risk systems carry Article 26 use obligations.',
    },
    {
      template_code: 'HIGH_DEPLOYER_FRIA',
      article_ref: 'Art. 27',
      title: 'Fundamental rights impact assessment',
      description:
        'Where required, carry out a fundamental rights impact assessment before deployment (Article 27).',
      roles: ['deployer'],
      applicability_reason: 'Certain deployers must complete a fundamental rights impact assessment.',
    },
    {
      template_code: 'HIGH_IMPORTER_CHECKS',
      article_ref: 'Art. 23',
      title: 'Importer verification of conformity',
      description:
        'Verify the provider completed conformity assessment, technical documentation and CE marking before import (Article 23).',
      roles: ['importer'],
      applicability_reason: 'Importers must verify high-risk conformity before placing on the market.',
    },
    {
      template_code: 'HIGH_DISTRIBUTOR_CHECKS',
      article_ref: 'Art. 24',
      title: 'Distributor verification of CE marking',
      description: 'Verify CE marking and accompanying documentation before making available (Article 24).',
      roles: ['distributor'],
      applicability_reason: 'Distributors must verify CE marking before making high-risk systems available.',
    },
  ],
  limited: [
    {
      template_code: 'LIM_ART50_TRANSPARENCY',
      article_ref: 'Art. 50',
      title: 'Article 50 transparency disclosure',
      description:
        'Inform natural persons that they are interacting with an AI system, or label synthetic/deepfake content as artificially generated (Article 50).',
      roles: [],
      applicability_reason: 'System triggers an Article 50 transparency obligation.',
    },
    {
      template_code: 'LIM_NOTICE_PUBLISH',
      article_ref: 'Art. 50',
      title: 'Publish and maintain transparency notice',
      description: 'Author, publish and version a transparency notice covering the relevant trigger.',
      roles: [],
      applicability_reason: 'Limited-risk systems must surface a transparency notice to users.',
    },
  ],
  minimal: [
    {
      template_code: 'MIN_VOLUNTARY_CODE',
      article_ref: 'Art. 95',
      title: 'Consider voluntary codes of conduct',
      description:
        'No mandatory obligations apply. Optionally adopt voluntary codes of conduct and document the minimal-risk determination (Article 95).',
      roles: [],
      applicability_reason: 'Minimal-risk systems have no mandatory obligations; voluntary measures recommended.',
    },
  ],
}

// GPAI obligations layered on top of the tier set when the system is a GPAI model.
const GPAI_TEMPLATES: ObligationTemplate[] = [
  {
    template_code: 'GPAI_TECH_DOC',
    article_ref: 'Art. 53',
    title: 'GPAI technical documentation and downstream info',
    description:
      'Maintain technical documentation and provide information/documentation to downstream providers (Article 53).',
    roles: ['provider', 'product_manufacturer'],
    applicability_reason: 'System is flagged as a general-purpose AI model.',
  },
  {
    template_code: 'GPAI_COPYRIGHT',
    article_ref: 'Art. 53',
    title: 'Copyright policy and training-data summary',
    description:
      'Put in place a policy to respect Union copyright law and publish a sufficiently detailed training-content summary (Article 53).',
    roles: ['provider', 'product_manufacturer'],
    applicability_reason: 'GPAI providers must publish a training-data summary.',
  },
]

const GPAI_SYSTEMIC_TEMPLATES: ObligationTemplate[] = [
  {
    template_code: 'GPAI_SYS_EVAL',
    article_ref: 'Art. 55',
    title: 'Model evaluation and systemic-risk mitigation',
    description:
      'Perform model evaluation, adversarial testing, systemic-risk assessment/mitigation and incident reporting (Article 55).',
    roles: ['provider', 'product_manufacturer'],
    applicability_reason: 'System is a GPAI model with systemic risk.',
  },
]

export function templatesForTierRole(
  tier: string | null,
  role: string,
  isGpai: boolean,
  isSystemic: boolean,
): ObligationTemplate[] {
  const out: ObligationTemplate[] = []
  const base = tier ? OBLIGATION_TEMPLATES[tier] ?? [] : []
  for (const t of base) {
    if (t.roles.length === 0 || t.roles.includes(role)) out.push(t)
  }
  if (isGpai) {
    for (const t of GPAI_TEMPLATES) {
      if (t.roles.length === 0 || t.roles.includes(role)) out.push(t)
    }
    if (isSystemic) {
      for (const t of GPAI_SYSTEMIC_TEMPLATES) {
        if (t.roles.length === 0 || t.roles.includes(role)) out.push(t)
      }
    }
  }
  return out
}

// Regenerate obligations for a system, preserving owner/status/due_date/evidence
// for templates that still apply. Returns the new obligation rows.
export async function regenerateObligationsForSystem(
  system: typeof ai_systems.$inferSelect,
): Promise<typeof obligations.$inferSelect[]> {
  const userId = system.user_id
  const wanted = templatesForTierRole(
    system.current_tier,
    system.role,
    system.is_gpai,
    system.is_systemic_risk,
  )

  const existing = await db
    .select()
    .from(obligations)
    .where(eq(obligations.system_id, system.id))

  const byCode = new Map(existing.map((o) => [o.template_code, o]))

  // Delete obligations whose template no longer applies.
  const wantedCodes = new Set(wanted.map((t) => t.template_code))
  for (const o of existing) {
    if (!wantedCodes.has(o.template_code)) {
      await db.delete(obligations).where(eq(obligations.id, o.id))
    }
  }

  const result: typeof obligations.$inferSelect[] = []
  for (const t of wanted) {
    const prior = byCode.get(t.template_code)
    if (prior) {
      // Preserve status/owner/due_date/evidence; refresh descriptive fields + tier.
      const [updated] = await db
        .update(obligations)
        .set({
          tier: system.current_tier ?? 'minimal',
          article_ref: t.article_ref,
          title: t.title,
          description: t.description,
          applicability_reason: t.applicability_reason,
          updated_at: new Date(),
        })
        .where(eq(obligations.id, prior.id))
        .returning()
      result.push(updated)
    } else {
      const [created] = await db
        .insert(obligations)
        .values({
          system_id: system.id,
          user_id: userId,
          tier: system.current_tier ?? 'minimal',
          article_ref: t.article_ref,
          title: t.title,
          description: t.description,
          applicability_reason: t.applicability_reason,
          template_code: t.template_code,
          status: 'not_started',
          evidence_links: [],
        })
        .returning()
      result.push(created)
    }
  }

  return result.sort((a, b) => a.article_ref.localeCompare(b.article_ref))
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  status: z.enum(['not_started', 'in_progress', 'blocked', 'complete', 'not_applicable']).optional(),
  owner: z.string().nullable().optional(),
  due_date: z.string().datetime().nullable().optional(),
  evidence_links: z.array(z.string()).optional(),
})

// GET / — all obligations for user (filters: system_id, tier, article, status, owner, due)
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([], 200)

  const rows = await db
    .select()
    .from(obligations)
    .where(eq(obligations.user_id, userId))
    .orderBy(desc(obligations.updated_at))

  const systemId = c.req.query('system_id')
  const tier = c.req.query('tier')
  const article = c.req.query('article')
  const status = c.req.query('status')
  const owner = c.req.query('owner')
  const due = c.req.query('due') // 'overdue' | 'has_due'

  let filtered = rows
  if (systemId) filtered = filtered.filter((r) => r.system_id === systemId)
  if (tier) filtered = filtered.filter((r) => r.tier === tier)
  if (article) filtered = filtered.filter((r) => r.article_ref.toLowerCase().includes(article.toLowerCase()))
  if (status) filtered = filtered.filter((r) => r.status === status)
  if (owner) filtered = filtered.filter((r) => r.owner === owner)
  if (due === 'has_due') filtered = filtered.filter((r) => r.due_date != null)
  if (due === 'overdue') {
    const now = Date.now()
    filtered = filtered.filter(
      (r) => r.due_date != null && new Date(r.due_date).getTime() < now && r.status !== 'complete',
    )
  }

  return c.json(filtered)
})

// GET /system/:systemId — obligations for one system
router.get('/system/:systemId', async (c) => {
  const systemId = c.req.param('systemId')
  const rows = await db
    .select()
    .from(obligations)
    .where(eq(obligations.system_id, systemId))
    .orderBy(obligations.article_ref)
  return c.json(rows)
})

// POST /system/:systemId/regenerate — regenerate from current tier/role
router.post('/system/:systemId/regenerate', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const systemId = c.req.param('systemId')
  const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, systemId))
  if (!system) return c.json({ error: 'Not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const rows = await regenerateObligationsForSystem(system)

  try {
    await db.insert(audit_log).values({
      user_id: userId,
      action: 'obligations.regenerate',
      entity_type: 'system',
      entity_id: systemId,
      summary: `Regenerated ${rows.length} obligation(s) for "${system.name}"`,
      meta: { count: rows.length, tier: system.current_tier },
    })
  } catch {
    // best-effort
  }

  return c.json(rows)
})

// PUT /:id — update obligation (status, owner, due_date, evidence_links)
router.put('/:id', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(obligations).where(eq(obligations.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const patch: Record<string, unknown> = { updated_at: new Date() }
  if (body.status !== undefined) patch.status = body.status
  if (body.owner !== undefined) patch.owner = body.owner
  if (body.due_date !== undefined) patch.due_date = body.due_date ? new Date(body.due_date) : null
  if (body.evidence_links !== undefined) patch.evidence_links = body.evidence_links

  const [updated] = await db
    .update(obligations)
    .set(patch)
    .where(eq(obligations.id, id))
    .returning()

  try {
    await db.insert(audit_log).values({
      user_id: userId,
      action: 'obligation.update',
      entity_type: 'obligation',
      entity_id: id,
      summary: `Updated obligation "${updated.title}"`,
      meta: { changed: Object.keys(body) },
    })
  } catch {
    // best-effort
  }

  return c.json(updated)
})

export default router
