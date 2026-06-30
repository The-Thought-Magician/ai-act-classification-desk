import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { tags, ai_systems } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const tagSchema = z.object({
  name: z.string().min(1).max(64),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .default('#6366f1'),
})

const assignSchema = z.object({
  system_id: z.string().min(1),
  tags: z.array(z.string().min(1)).default([]),
})

// GET / — user tags
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([])
  const rows = await db.select().from(tags).where(eq(tags.user_id, userId)).orderBy(tags.name)
  return c.json(rows)
})

// POST / — create tag
router.post('/', authMiddleware, zValidator('json', tagSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const existing = await db
    .select()
    .from(tags)
    .where(and(eq(tags.user_id, userId), eq(tags.name, body.name)))
  if (existing.length > 0) return c.json(existing[0])
  const [created] = await db.insert(tags).values({ user_id: userId, name: body.name, color: body.color }).returning()
  return c.json(created, 201)
})

// DELETE /:id — delete tag
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(tags).where(eq(tags.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(tags).where(eq(tags.id, id))
  return c.json({ success: true })
})

// POST /assign — set tags on a system (body { system_id, tags })
router.post('/assign', authMiddleware, zValidator('json', assignSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, body.system_id))
  if (!system) return c.json({ error: 'System not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // Normalize / dedupe the requested tag names.
  const wanted = [...new Set(body.tags.map((t) => t.trim()).filter((t) => t.length > 0))]

  // Auto-create any tags that do not yet exist for this user.
  const existing = await db.select().from(tags).where(eq(tags.user_id, userId))
  const existingNames = new Set(existing.map((t) => t.name))
  for (const name of wanted) {
    if (!existingNames.has(name)) {
      try {
        await db.insert(tags).values({ user_id: userId, name }).returning()
      } catch {
        // Unique(user_id,name) race — safe to ignore.
      }
    }
  }

  const [updated] = await db
    .update(ai_systems)
    .set({ tags: wanted, updated_at: new Date() })
    .where(and(eq(ai_systems.id, body.system_id), eq(ai_systems.user_id, userId)))
    .returning()
  return c.json(updated)
})

export default router
