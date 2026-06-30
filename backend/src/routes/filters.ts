import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { saved_filters, audit_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const filterSchema = z.object({
  name: z.string().min(1),
  scope: z.string().min(1).default('systems'),
  criteria: z.record(z.string(), z.unknown()).optional().default({}),
})

// Public: list the current user's saved filters
router.get('/', async (c) => {
  const userId = getUserId(c)
  const rows = await db
    .select()
    .from(saved_filters)
    .where(eq(saved_filters.user_id, userId))
    .orderBy(desc(saved_filters.created_at))
  return c.json(rows)
})

// Auth-gated: create a saved filter
router.post('/', authMiddleware, zValidator('json', filterSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(saved_filters)
    .values({
      user_id: userId,
      name: body.name,
      scope: body.scope,
      criteria: body.criteria as Record<string, unknown>,
    })
    .returning()
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'create',
    entity_type: 'saved_filter',
    entity_id: created.id,
    summary: `Created saved filter "${created.name}"`,
    meta: { scope: created.scope },
  })
  return c.json(created, 201)
})

// Auth-gated: delete a saved filter (ownership-checked)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(saved_filters).where(eq(saved_filters.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(saved_filters).where(and(eq(saved_filters.id, id), eq(saved_filters.user_id, userId)))
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'delete',
    entity_type: 'saved_filter',
    entity_id: id,
    summary: `Deleted saved filter "${existing.name}"`,
    meta: {},
  })
  return c.json({ success: true })
})

export default router
