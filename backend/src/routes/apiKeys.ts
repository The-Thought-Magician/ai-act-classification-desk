import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { createHash, randomBytes } from 'node:crypto'
import { db } from '../db/index.js'
import { api_keys, audit_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const createKeySchema = z.object({
  name: z.string().min(1),
})

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

// Public read: list current user's keys WITHOUT the hashed secret
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([], 200)
  const rows = await db
    .select({
      id: api_keys.id,
      user_id: api_keys.user_id,
      name: api_keys.name,
      prefix: api_keys.prefix,
      last_used_at: api_keys.last_used_at,
      created_at: api_keys.created_at,
    })
    .from(api_keys)
    .where(eq(api_keys.user_id, userId))
    .orderBy(desc(api_keys.created_at))
  return c.json(rows)
})

// Create a key — returns the plaintext secret exactly once
router.post('/', authMiddleware, zValidator('json', createKeySchema), async (c) => {
  const userId = getUserId(c)
  const { name } = c.req.valid('json')

  const prefix = `aiact_${randomBytes(4).toString('hex')}`
  const rawSecret = randomBytes(24).toString('hex')
  const secret = `${prefix}_${rawSecret}`
  const hashed = hashSecret(secret)

  const [created] = await db
    .insert(api_keys)
    .values({
      user_id: userId,
      name,
      prefix,
      hashed_secret: hashed,
    })
    .returning({
      id: api_keys.id,
      user_id: api_keys.user_id,
      name: api_keys.name,
      prefix: api_keys.prefix,
      last_used_at: api_keys.last_used_at,
      created_at: api_keys.created_at,
    })

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'create',
    entity_type: 'api_key',
    entity_id: created.id,
    summary: `Issued API key "${name}"`,
    meta: { prefix },
  })

  // secret returned ONCE; never retrievable again
  return c.json({ key: created, secret }, 201)
})

// Revoke (delete) a key
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(api_keys).where(eq(api_keys.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(api_keys).where(eq(api_keys.id, id))
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'revoke',
    entity_type: 'api_key',
    entity_id: id,
    summary: `Revoked API key "${existing.name}"`,
    meta: { prefix: existing.prefix },
  })
  return c.json({ success: true })
})

export default router
