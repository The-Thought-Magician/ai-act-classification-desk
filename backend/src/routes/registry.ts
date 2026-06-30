import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  registry_packages,
  ai_systems,
  evidence_requirements,
  audit_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Fields required for an EU database (Annex VIII) registration entry.
// Each must be a non-empty value in registry_packages.fields for the package
// to be considered complete.
const REQUIRED_FIELDS: Array<{ key: string; label: string }> = [
  { key: 'provider_name', label: 'Provider name' },
  { key: 'provider_contact', label: 'Provider contact details' },
  { key: 'system_name', label: 'Trade name / system name' },
  { key: 'intended_purpose', label: 'Intended purpose' },
  { key: 'annex_iii_category', label: 'Annex III high-risk category' },
  { key: 'member_states', label: 'Member States where placed on market' },
  { key: 'certification_status', label: 'Conformity assessment / certification status' },
  { key: 'instructions_url', label: 'Instructions for use' },
]

function isFilled(v: unknown): boolean {
  if (v === undefined || v === null) return false
  if (typeof v === 'string') return v.trim().length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

// Recompute readiness and blocking reasons for a package, factoring in both the
// Annex VIII fields and outstanding required evidence for the system.
async function recompute(
  fields: Record<string, unknown>,
  system: { current_tier: string | null; status: string },
  systemId: string,
): Promise<{ readiness_pct: number; blocking_reasons: string[] }> {
  const blocking: string[] = []

  const missingFields = REQUIRED_FIELDS.filter((f) => !isFilled(fields[f.key]))
  for (const f of missingFields) blocking.push(`Missing field: ${f.label}`)

  // Only high-risk systems are subject to EU database registration (Art 49).
  if (system.current_tier !== 'high') {
    blocking.push('System is not classified high-risk; EU registration not applicable')
  }

  // Outstanding required evidence (Annex IV) blocks registration readiness.
  const reqs = await db
    .select()
    .from(evidence_requirements)
    .where(eq(evidence_requirements.system_id, systemId))
  const openEvidence = reqs.filter(
    (r) => r.required && r.status !== 'approved' && r.status !== 'not_applicable',
  )
  if (openEvidence.length > 0) {
    blocking.push(`${openEvidence.length} required evidence item(s) not yet approved`)
  }

  // Readiness is purely the proportion of required Annex VIII fields supplied.
  const filledFields = REQUIRED_FIELDS.length - missingFields.length
  const readiness_pct = Math.round((filledFields / REQUIRED_FIELDS.length) * 1000) / 10

  return { readiness_pct, blocking_reasons: blocking }
}

async function loadOwnedSystem(systemId: string, userId: string) {
  const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, systemId))
  return system
}

// Auto-create a draft package for a system if none exists.
async function ensurePackage(systemId: string, userId: string) {
  const [existing] = await db
    .select()
    .from(registry_packages)
    .where(eq(registry_packages.system_id, systemId))
  if (existing) return existing
  const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, systemId))
  if (!system) return null
  const seedFields: Record<string, unknown> = {
    provider_name: '',
    provider_contact: '',
    system_name: system.name,
    intended_purpose: system.intended_purpose ?? '',
    annex_iii_category: system.purpose_category ?? '',
    member_states: system.geographies ?? [],
    certification_status: '',
    instructions_url: '',
  }
  const { readiness_pct, blocking_reasons } = await recompute(seedFields, system, systemId)
  const [created] = await db
    .insert(registry_packages)
    .values({
      system_id: systemId,
      user_id: system.user_id,
      fields: seedFields,
      status: 'draft',
      readiness_pct,
      blocking_reasons,
      version: 1,
    })
    .returning()
  return created
}

// GET / — all registry packages for user
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const rows = await db
    .select()
    .from(registry_packages)
    .where(eq(registry_packages.user_id, userId))
    .orderBy(desc(registry_packages.updated_at))
  return c.json(rows)
})

// GET /system/:systemId — package for a system (auto-create draft if absent)
router.get('/system/:systemId', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const systemId = c.req.param('systemId')
  const system = await loadOwnedSystem(systemId, userId)
  if (!system) return c.json({ error: 'System not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const pkg = await ensurePackage(systemId, userId)
  if (!pkg) return c.json({ error: 'System not found' }, 404)
  return c.json(pkg)
})

// PUT /system/:systemId — update package fields; recompute readiness + blocking_reasons
const updateSchema = z.object({
  fields: z.record(z.unknown()).optional(),
  status: z.enum(['draft', 'ready', 'submitted', 'registered']).optional(),
  registered_reference: z.string().nullable().optional(),
})

router.put('/system/:systemId', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const systemId = c.req.param('systemId')
  const system = await loadOwnedSystem(systemId, userId)
  if (!system) return c.json({ error: 'System not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const existing = await ensurePackage(systemId, userId)
  if (!existing) return c.json({ error: 'System not found' }, 404)

  const body = c.req.valid('json')
  const mergedFields = {
    ...(existing.fields ?? {}),
    ...(body.fields ?? {}),
  } as Record<string, unknown>
  const { readiness_pct, blocking_reasons } = await recompute(mergedFields, system, systemId)

  const [updated] = await db
    .update(registry_packages)
    .set({
      fields: mergedFields,
      ...(body.status ? { status: body.status } : {}),
      ...(body.registered_reference !== undefined
        ? { registered_reference: body.registered_reference }
        : {}),
      readiness_pct,
      blocking_reasons,
      updated_at: new Date(),
    })
    .where(eq(registry_packages.id, existing.id))
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'update',
    entity_type: 'registry_package',
    entity_id: existing.id,
    summary: `Updated registry package for ${system.name} (${readiness_pct}% ready)`,
    meta: { readiness_pct, blocking_count: blocking_reasons.length },
  })

  return c.json(updated)
})

// POST /system/:systemId/submit — submission-readiness gate
router.post('/system/:systemId/submit', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const systemId = c.req.param('systemId')
  const system = await loadOwnedSystem(systemId, userId)
  if (!system) return c.json({ error: 'System not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const existing = await ensurePackage(systemId, userId)
  if (!existing) return c.json({ error: 'System not found' }, 404)

  const fields = (existing.fields ?? {}) as Record<string, unknown>
  const { readiness_pct, blocking_reasons } = await recompute(fields, system, systemId)

  // Gate: cannot submit while any blocking reason remains.
  if (blocking_reasons.length > 0) {
    const [updated] = await db
      .update(registry_packages)
      .set({ readiness_pct, blocking_reasons, updated_at: new Date() })
      .where(eq(registry_packages.id, existing.id))
      .returning()
    return c.json(
      {
        ...updated,
        error: 'Submission blocked',
        blocking_reasons,
      },
      400,
    )
  }

  // If already submitted/registered keep that status; otherwise mark submitted.
  const nextStatus =
    existing.status === 'registered' ? 'registered' : 'submitted'

  const [updated] = await db
    .update(registry_packages)
    .set({
      status: nextStatus,
      readiness_pct,
      blocking_reasons: [],
      version: existing.version + 1,
      updated_at: new Date(),
    })
    .where(eq(registry_packages.id, existing.id))
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'submit',
    entity_type: 'registry_package',
    entity_id: existing.id,
    summary: `Submitted registry package for ${system.name}`,
    meta: { previous_status: existing.status, new_status: nextStatus },
  })

  return c.json(updated)
})

export default router
