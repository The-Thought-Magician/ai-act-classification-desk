import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import {
  ai_systems,
  system_versions,
  audit_log,
} from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const VALID_ROLES = [
  'provider',
  'deployer',
  'importer',
  'distributor',
  'product_manufacturer',
] as const

const VALID_STATUS = ['draft', 'classified', 'under_review', 'registered'] as const

const systemSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(''),
  role: z.enum(VALID_ROLES),
  intended_purpose: z.string().optional().default(''),
  purpose_category: z.string().optional().default(''),
  modality: z.string().optional().default('other'),
  geographies: z.array(z.string()).optional().default([]),
  placed_on_eu_market: z.boolean().optional().default(true),
  lifecycle_stage: z.string().optional().default('concept'),
  is_gpai: z.boolean().optional().default(false),
  is_systemic_risk: z.boolean().optional().default(false),
  status: z.enum(VALID_STATUS).optional().default('draft'),
  tags: z.array(z.string()).optional().default([]),
})

const archiveSchema = z.object({ archived: z.boolean() })

async function writeAudit(
  userId: string,
  action: string,
  entityId: string,
  summary: string,
  meta: Record<string, unknown> = {},
) {
  try {
    await db.insert(audit_log).values({
      user_id: userId,
      action,
      entity_type: 'system',
      entity_id: entityId,
      summary,
      meta,
    })
  } catch {
    // audit is best-effort; never block the request
  }
}

// GET / — list current user's systems (filters: tier, status, archived, tag)
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([], 200)

  const rows = await db
    .select()
    .from(ai_systems)
    .where(eq(ai_systems.user_id, userId))
    .orderBy(desc(ai_systems.updated_at))

  const tier = c.req.query('tier')
  const status = c.req.query('status')
  const archivedQ = c.req.query('archived')
  const tag = c.req.query('tag')

  let filtered = rows
  if (tier) filtered = filtered.filter((r) => r.current_tier === tier)
  if (status) filtered = filtered.filter((r) => r.status === status)
  if (archivedQ === 'true') filtered = filtered.filter((r) => r.archived === true)
  else if (archivedQ === 'false' || archivedQ === undefined) filtered = filtered.filter((r) => r.archived === false)
  if (tag) filtered = filtered.filter((r) => Array.isArray(r.tags) && r.tags.includes(tag))

  return c.json(filtered)
})

// GET /:id — system detail
router.get('/:id', async (c) => {
  const [s] = await db.select().from(ai_systems).where(eq(ai_systems.id, c.req.param('id')))
  if (!s) return c.json({ error: 'Not found' }, 404)
  return c.json(s)
})

// POST / — create system + initial intake snapshot
router.post('/', authMiddleware, zValidator('json', systemSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  const [created] = await db
    .insert(ai_systems)
    .values({
      user_id: userId,
      name: body.name,
      description: body.description,
      role: body.role,
      intended_purpose: body.intended_purpose,
      purpose_category: body.purpose_category,
      modality: body.modality,
      geographies: body.geographies,
      placed_on_eu_market: body.placed_on_eu_market,
      lifecycle_stage: body.lifecycle_stage,
      is_gpai: body.is_gpai,
      is_systemic_risk: body.is_systemic_risk,
      status: body.status,
      tags: body.tags,
    })
    .returning()

  // Immutable intake snapshot of the creation state.
  await db.insert(system_versions).values({
    system_id: created.id,
    snapshot: created as unknown as Record<string, unknown>,
    created_by: userId,
  })

  await writeAudit(userId, 'system.create', created.id, `Created system "${created.name}"`)

  return c.json(created, 201)
})

// PUT /:id — update system (records a new intake snapshot)
router.put('/:id', authMiddleware, zValidator('json', systemSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(ai_systems).where(eq(ai_systems.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const [updated] = await db
    .update(ai_systems)
    .set({ ...body, updated_at: new Date() })
    .where(eq(ai_systems.id, id))
    .returning()

  await db.insert(system_versions).values({
    system_id: id,
    snapshot: updated as unknown as Record<string, unknown>,
    created_by: userId,
  })

  await writeAudit(userId, 'system.update', id, `Updated system "${updated.name}"`, { changed: Object.keys(body) })

  return c.json(updated)
})

// DELETE /:id
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(ai_systems).where(eq(ai_systems.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  await db.delete(ai_systems).where(eq(ai_systems.id, id))
  await writeAudit(userId, 'system.delete', id, `Deleted system "${existing.name}"`)

  return c.json({ success: true })
})

// POST /:id/archive — archive/restore
router.post('/:id/archive', authMiddleware, zValidator('json', archiveSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(ai_systems).where(eq(ai_systems.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const { archived } = c.req.valid('json')
  const [updated] = await db
    .update(ai_systems)
    .set({ archived, updated_at: new Date() })
    .where(eq(ai_systems.id, id))
    .returning()

  await writeAudit(
    userId,
    archived ? 'system.archive' : 'system.restore',
    id,
    `${archived ? 'Archived' : 'Restored'} system "${updated.name}"`,
  )

  return c.json(updated)
})

// GET /:id/versions — intake snapshots
router.get('/:id/versions', async (c) => {
  const id = c.req.param('id')
  const rows = await db
    .select()
    .from(system_versions)
    .where(eq(system_versions.system_id, id))
    .orderBy(desc(system_versions.created_at))
  return c.json(rows)
})

// GET /:id/activity — per-system activity timeline (audit_log filtered)
router.get('/:id/activity', async (c) => {
  const id = c.req.param('id')
  const rows = await db
    .select()
    .from(audit_log)
    .where(and(eq(audit_log.entity_type, 'system'), eq(audit_log.entity_id, id)))
    .orderBy(desc(audit_log.created_at))
  return c.json(rows)
})

export default router
