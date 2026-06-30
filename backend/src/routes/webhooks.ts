import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { webhooks, webhook_deliveries, audit_log } from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).optional().default([]),
  secret: z.string().optional().default(''),
  active: z.boolean().optional().default(true),
})

// Public read: list current user's webhooks
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json([], 200)
  const rows = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.user_id, userId))
    .orderBy(desc(webhooks.created_at))
  return c.json(rows)
})

// Create a webhook
router.post('/', authMiddleware, zValidator('json', webhookSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const [created] = await db
    .insert(webhooks)
    .values({
      user_id: userId,
      url: body.url,
      events: body.events,
      secret: body.secret,
      active: body.active,
    })
    .returning()
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'create',
    entity_type: 'webhook',
    entity_id: created.id,
    summary: `Created webhook ${created.url}`,
    meta: { events: created.events },
  })
  return c.json(created, 201)
})

// Update a webhook (events, url, active, secret)
router.put('/:id', authMiddleware, zValidator('json', webhookSchema.partial()), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(webhooks).where(eq(webhooks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const body = c.req.valid('json')
  const [updated] = await db
    .update(webhooks)
    .set({
      ...(body.url !== undefined ? { url: body.url } : {}),
      ...(body.events !== undefined ? { events: body.events } : {}),
      ...(body.secret !== undefined ? { secret: body.secret } : {}),
      ...(body.active !== undefined ? { active: body.active } : {}),
    })
    .where(eq(webhooks.id, id))
    .returning()
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'update',
    entity_type: 'webhook',
    entity_id: id,
    summary: `Updated webhook ${updated.url}`,
    meta: {},
  })
  return c.json(updated)
})

// Delete a webhook (and its delivery log)
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(webhooks).where(eq(webhooks.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(webhook_deliveries).where(eq(webhook_deliveries.webhook_id, id))
  await db.delete(webhooks).where(eq(webhooks.id, id))
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'delete',
    entity_type: 'webhook',
    entity_id: id,
    summary: `Deleted webhook ${existing.url}`,
    meta: {},
  })
  return c.json({ success: true })
})

// Public read: delivery log for a webhook (ownership-scoped)
router.get('/:id/deliveries', async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, id))
  if (!hook) return c.json({ error: 'Not found' }, 404)
  if (userId && hook.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  const rows = await db
    .select()
    .from(webhook_deliveries)
    .where(eq(webhook_deliveries.webhook_id, id))
    .orderBy(desc(webhook_deliveries.created_at))
  return c.json(rows)
})

// Send a test delivery — actually POSTs to the webhook URL and records the result
router.post('/:id/test', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [hook] = await db.select().from(webhooks).where(eq(webhooks.id, id))
  if (!hook) return c.json({ error: 'Not found' }, 404)
  if (hook.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const event = 'webhook.test'
  const payload: Record<string, unknown> = {
    event,
    webhook_id: hook.id,
    delivered_at: new Date().toISOString(),
    message: 'This is a test delivery from AI Act Classification Desk.',
  }

  let statusCode = 0
  let ok = false
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (hook.secret) headers['X-Webhook-Secret'] = hook.secret
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    const res = await fetch(hook.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    clearTimeout(timer)
    statusCode = res.status
    ok = res.ok
  } catch {
    statusCode = 0
    ok = false
  }

  const [delivery] = await db
    .insert(webhook_deliveries)
    .values({
      webhook_id: hook.id,
      event,
      payload,
      status_code: statusCode,
      ok,
    })
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'test',
    entity_type: 'webhook',
    entity_id: hook.id,
    summary: `Test delivery to ${hook.url} (${ok ? 'ok' : 'failed'})`,
    meta: { status_code: statusCode, ok },
  })

  return c.json(delivery, 201)
})

export default router
