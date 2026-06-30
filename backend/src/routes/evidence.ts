import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  evidence_requirements,
  evidence_artifacts,
  audit_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Statuses that count as "satisfied" when computing readiness.
const SATISFIED = new Set(['approved'])
// Statuses that are not blocking when required but still incomplete.
const IN_FLIGHT = new Set(['draft', 'in_review'])

function readinessFor(reqs: Array<{ required: boolean; status: string }>): {
  readiness_pct: number
  gap_count: number
} {
  const applicable = reqs.filter((r) => r.required && r.status !== 'not_applicable')
  if (applicable.length === 0) return { readiness_pct: 100, gap_count: 0 }
  const satisfied = applicable.filter((r) => SATISFIED.has(r.status)).length
  const gap = applicable.filter((r) => !SATISFIED.has(r.status)).length
  return {
    readiness_pct: Math.round((satisfied / applicable.length) * 1000) / 10,
    gap_count: gap,
  }
}

// GET / — all evidence requirements for user (filters: status, category, reviewer, system_id)
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const { status, category, reviewer, system_id } = c.req.query()
  const conds = [eq(evidence_requirements.user_id, userId)]
  if (status) conds.push(eq(evidence_requirements.status, status))
  if (category) conds.push(eq(evidence_requirements.category, category))
  if (reviewer) conds.push(eq(evidence_requirements.reviewer, reviewer))
  if (system_id) conds.push(eq(evidence_requirements.system_id, system_id))
  const rows = await db
    .select()
    .from(evidence_requirements)
    .where(and(...conds))
    .orderBy(desc(evidence_requirements.updated_at))
  return c.json(rows)
})

// GET /system/:systemId — requirements + readiness for one system
router.get('/system/:systemId', async (c) => {
  const systemId = c.req.param('systemId')
  const rows = await db
    .select()
    .from(evidence_requirements)
    .where(eq(evidence_requirements.system_id, systemId))
    .orderBy(evidence_requirements.requirement_code)
  const { readiness_pct, gap_count } = readinessFor(rows)
  return c.json({ requirements: rows, readiness_pct, gap_count })
})

// PUT /requirement/:id — update requirement (status, artifact_url, reviewer, notes)
const requirementPatch = z.object({
  status: z.enum(['missing', 'draft', 'in_review', 'approved', 'not_applicable']).optional(),
  artifact_url: z.string().url().nullable().optional(),
  artifact_meta: z.record(z.unknown()).optional(),
  reviewer: z.string().nullable().optional(),
  notes: z.string().optional(),
  required: z.boolean().optional(),
})

router.put('/requirement/:id', authMiddleware, zValidator('json', requirementPatch), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const body = c.req.valid('json')
  const [existing] = await db
    .select()
    .from(evidence_requirements)
    .where(eq(evidence_requirements.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const [updated] = await db
    .update(evidence_requirements)
    .set({ ...body, updated_at: new Date() })
    .where(eq(evidence_requirements.id, id))
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'update',
    entity_type: 'evidence_requirement',
    entity_id: id,
    summary: `Updated evidence requirement ${updated.requirement_code}`,
    meta: { changes: body },
  })

  return c.json(updated)
})

// GET /artifacts — reusable artifacts
router.get('/artifacts', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const rows = await db
    .select()
    .from(evidence_artifacts)
    .where(eq(evidence_artifacts.user_id, userId))
    .orderBy(desc(evidence_artifacts.created_at))
  return c.json(rows)
})

// POST /artifacts — create artifact
const artifactSchema = z.object({
  name: z.string().min(1),
  url: z.string().optional().default(''),
  meta: z.record(z.unknown()).optional().default({}),
})

router.post('/artifacts', authMiddleware, zValidator('json', artifactSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [artifact] = await db
    .insert(evidence_artifacts)
    .values({ user_id: userId, name: body.name, url: body.url, meta: body.meta })
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'create',
    entity_type: 'evidence_artifact',
    entity_id: artifact.id,
    summary: `Created artifact ${artifact.name}`,
    meta: {},
  })

  return c.json(artifact, 201)
})

// DELETE /artifacts/:id — delete artifact
router.delete('/artifacts/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(evidence_artifacts)
    .where(eq(evidence_artifacts.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(evidence_artifacts).where(eq(evidence_artifacts.id, id))

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'delete',
    entity_type: 'evidence_artifact',
    entity_id: id,
    summary: `Deleted artifact ${existing.name}`,
    meta: {},
  })

  return c.json({ success: true })
})

export default router
