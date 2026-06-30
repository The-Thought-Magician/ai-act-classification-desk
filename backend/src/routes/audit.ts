import { Hono } from 'hono'
import { db } from '../db/index.js'
import { audit_log } from '../db/schema.js'
import { eq, and, desc, gte, lte, type SQL } from 'drizzle-orm'
import { getUserId } from '../lib/auth.js'

const router = new Hono()

// Public read (ownership-scoped): immutable audit log for the current user.
// Filters: action, entity_type, from (ISO date), to (ISO date).
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([], 200)

  const action = c.req.query('action')
  const entityType = c.req.query('entity_type')
  const from = c.req.query('from')
  const to = c.req.query('to')

  const conds: SQL[] = [eq(audit_log.user_id, userId)]
  if (action) conds.push(eq(audit_log.action, action))
  if (entityType) conds.push(eq(audit_log.entity_type, entityType))
  if (from) {
    const d = new Date(from)
    if (!Number.isNaN(d.getTime())) conds.push(gte(audit_log.created_at, d))
  }
  if (to) {
    const d = new Date(to)
    if (!Number.isNaN(d.getTime())) conds.push(lte(audit_log.created_at, d))
  }

  const rows = await db
    .select()
    .from(audit_log)
    .where(and(...conds))
    .orderBy(desc(audit_log.created_at))
    .limit(500)

  return c.json(rows)
})

export default router
