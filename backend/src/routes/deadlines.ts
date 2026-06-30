import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import {
  ai_systems,
  deadlines,
  obligations,
  registry_packages,
  audit_log,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'
import {
  type Job,
  computeCollisions,
  loadHeatmap,
  coverageGaps,
  dstTraps,
  autoSpread,
  nextFirings,
  validateExpression,
  describeExpression,
} from '../lib/cron.js'

const router = new Hono()

const DAY_MS = 86_400_000
const DUE_SOON_DAYS = 7

interface AggregatedDeadline {
  id: string
  label: string
  due_date: string
  source: 'custom' | 'obligation' | 'registry'
  status: string
  system_id: string | null
  system_name: string | null
  bucket: 'overdue' | 'due_soon' | 'upcoming'
}

// Collect every dated commitment for a user across custom deadlines, obligations
// with a due_date, and registry packages with a registration deadline field.
async function collectDeadlines(userId: string): Promise<AggregatedDeadline[]> {
  const systems = await db.select().from(ai_systems).where(eq(ai_systems.user_id, userId))
  const nameById = new Map(systems.map((s) => [s.id, s.name]))

  const out: AggregatedDeadline[] = []
  const now = Date.now()

  const classify = (ms: number): AggregatedDeadline['bucket'] => {
    if (ms < now) return 'overdue'
    if (ms <= now + DUE_SOON_DAYS * DAY_MS) return 'due_soon'
    return 'upcoming'
  }

  // 1. Custom deadlines
  const custom = await db.select().from(deadlines).where(eq(deadlines.user_id, userId))
  for (const d of custom) {
    const ms = new Date(d.due_date).getTime()
    out.push({
      id: d.id,
      label: d.label,
      due_date: new Date(d.due_date).toISOString(),
      source: 'custom',
      status: d.status,
      system_id: d.system_id ?? null,
      system_name: d.system_id ? nameById.get(d.system_id) ?? null : null,
      bucket: classify(ms),
    })
  }

  // 2. Obligations with a due_date
  const obl = await db.select().from(obligations).where(eq(obligations.user_id, userId))
  for (const o of obl) {
    if (!o.due_date) continue
    if (o.status === 'complete' || o.status === 'not_applicable') continue
    const ms = new Date(o.due_date).getTime()
    out.push({
      id: o.id,
      label: o.title,
      due_date: new Date(o.due_date).toISOString(),
      source: 'obligation',
      status: o.status,
      system_id: o.system_id,
      system_name: nameById.get(o.system_id) ?? null,
      bucket: classify(ms),
    })
  }

  // 3. Registry packages — a `registration_deadline` field on the package, if set.
  const reg = await db.select().from(registry_packages).where(eq(registry_packages.user_id, userId))
  for (const r of reg) {
    const fields = (r.fields ?? {}) as Record<string, unknown>
    const raw = fields.registration_deadline
    if (typeof raw !== 'string' || raw.length === 0) continue
    const ms = Date.parse(raw)
    if (!Number.isFinite(ms)) continue
    if (r.status === 'registered') continue
    out.push({
      id: r.id,
      label: `Registry submission${r.system_id && nameById.get(r.system_id) ? `: ${nameById.get(r.system_id)}` : ''}`,
      due_date: new Date(ms).toISOString(),
      source: 'registry',
      status: r.status,
      system_id: r.system_id,
      system_name: nameById.get(r.system_id) ?? null,
      bucket: classify(ms),
    })
  }

  out.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())
  return out
}

// Map aggregated deadlines onto cron-engine one-off Jobs so the deterministic
// scheduling engine (collisions / coverage / heatmap / DST / optimizer) can run
// over the portfolio's dated commitments.
function deadlinesToJobs(items: AggregatedDeadline[], timezone?: string): Job[] {
  return items.map((d) => ({
    id: d.id,
    kind: 'oneoff' as const,
    expr: d.due_date,
    timezone,
    resourceId: d.system_id ?? undefined,
  }))
}

// ---------------------------------------------------------------------------
// GET / — aggregated deadlines bucketed overdue / due_soon / upcoming
// ---------------------------------------------------------------------------
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ overdue: [], due_soon: [], upcoming: [] })
  const all = await collectDeadlines(userId)
  return c.json({
    overdue: all.filter((d) => d.bucket === 'overdue'),
    due_soon: all.filter((d) => d.bucket === 'due_soon'),
    upcoming: all.filter((d) => d.bucket === 'upcoming'),
  })
})

const createSchema = z.object({
  label: z.string().min(1),
  due_date: z.string().refine((s) => Number.isFinite(Date.parse(s)), 'due_date must be a valid ISO timestamp'),
  system_id: z.string().optional(),
})

// ---------------------------------------------------------------------------
// POST / — create a custom deadline
// ---------------------------------------------------------------------------
router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // If tied to a system, verify ownership.
  if (body.system_id) {
    const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, body.system_id))
    if (!system) return c.json({ error: 'System not found' }, 404)
    if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  }

  const [created] = await db
    .insert(deadlines)
    .values({
      user_id: userId,
      label: body.label,
      due_date: new Date(body.due_date),
      source: 'custom',
      status: 'open',
      system_id: body.system_id ?? null,
    })
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'create',
    entity_type: 'deadline',
    entity_id: created.id,
    summary: `Created deadline "${body.label}"`,
    meta: { due_date: created.due_date },
  })

  return c.json(created, 201)
})

// ---------------------------------------------------------------------------
// DELETE /:id — delete a custom deadline (custom source only; ownership checked)
// ---------------------------------------------------------------------------
router.delete('/:id', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db.select().from(deadlines).where(eq(deadlines.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)
  await db.delete(deadlines).where(eq(deadlines.id, id))
  await db.insert(audit_log).values({
    user_id: userId,
    action: 'delete',
    entity_type: 'deadline',
    entity_id: id,
    summary: `Deleted deadline "${existing.label}"`,
    meta: {},
  })
  return c.json({ success: true })
})

// ---------------------------------------------------------------------------
// GET /timeline — describe each upcoming deadline + its next firing projection
// using the deterministic cron engine.
// ---------------------------------------------------------------------------
router.get('/timeline', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ items: [] })
  const tz = c.req.query('timezone') || 'UTC'
  const all = await collectDeadlines(userId)
  const items = all.map((d) => {
    const v = validateExpression('oneoff', d.due_date)
    return {
      ...d,
      schedule_valid: v.valid,
      description: describeExpression('oneoff', d.due_date, tz),
      next_firings: nextFirings('oneoff', d.due_date, tz),
    }
  })
  return c.json({ timezone: tz, items })
})

// ---------------------------------------------------------------------------
// GET /collisions — deadlines that fall in the same minute (deterministic engine)
// ---------------------------------------------------------------------------
router.get('/collisions', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ collisions: [] })
  const tz = c.req.query('timezone') || 'UTC'
  const horizonDays = Math.max(1, Math.min(parseInt(c.req.query('horizonDays') ?? '90', 10) || 90, 730))
  const all = await collectDeadlines(userId)
  const jobs = deadlinesToJobs(all, tz)
  const collisions = computeCollisions(jobs, { horizonDays })
  return c.json({ horizonDays, collisions })
})

// ---------------------------------------------------------------------------
// GET /heatmap — hourly density of deadline firings over the horizon
// ---------------------------------------------------------------------------
router.get('/heatmap', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ buckets: [] })
  const tz = c.req.query('timezone') || 'UTC'
  const horizonDays = Math.max(1, Math.min(parseInt(c.req.query('horizonDays') ?? '90', 10) || 90, 730))
  const all = await collectDeadlines(userId)
  const jobs = deadlinesToJobs(all, tz)
  const buckets = loadHeatmap(jobs, { horizonDays })
  return c.json({ horizonDays, buckets })
})

// ---------------------------------------------------------------------------
// POST /coverage — coverage gaps between deadlines within required windows
// ---------------------------------------------------------------------------
const coverageSchema = z.object({
  windows: z.array(z.object({ start: z.string(), end: z.string() })).min(1),
  horizonDays: z.number().int().positive().max(730).optional(),
  timezone: z.string().optional(),
})
router.post('/coverage', authMiddleware, zValidator('json', coverageSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const all = await collectDeadlines(userId)
  const jobs = deadlinesToJobs(all, body.timezone)
  const gaps = coverageGaps(body.windows, jobs, { horizonDays: body.horizonDays ?? 90 })
  return c.json({ gaps })
})

// ---------------------------------------------------------------------------
// GET /dst — DST traps for deadlines in a given timezone
// ---------------------------------------------------------------------------
router.get('/dst', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ traps: [] })
  const tz = c.req.query('timezone') || 'Europe/Brussels'
  const all = await collectDeadlines(userId)
  const traps = all.flatMap((d) => dstTraps('oneoff', d.due_date, tz).map((t) => ({ ...t, deadline_id: d.id, label: d.label })))
  return c.json({ timezone: tz, traps })
})

// ---------------------------------------------------------------------------
// GET /optimizer — auto-spread suggestions for colliding deadlines
// ---------------------------------------------------------------------------
router.get('/optimizer', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ suggestions: [] })
  const tz = c.req.query('timezone') || 'UTC'
  const horizonDays = Math.max(1, Math.min(parseInt(c.req.query('horizonDays') ?? '90', 10) || 90, 730))
  const all = await collectDeadlines(userId)
  const byId = new Map(all.map((d) => [d.id, d]))
  const jobs = deadlinesToJobs(all, tz)
  const suggestions = autoSpread(jobs, { horizonDays }).map((s) => ({
    ...s,
    label: byId.get(s.jobId)?.label ?? '',
    currentDueDate: byId.get(s.jobId)?.due_date ?? null,
  }))
  return c.json({ horizonDays, suggestions })
})

// ---------------------------------------------------------------------------
// GET /firings/:id — next projected firings for a single deadline
// ---------------------------------------------------------------------------
router.get('/firings/:id', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ firings: [] })
  const id = c.req.param('id')
  const tz = c.req.query('timezone') || 'UTC'
  const count = Math.max(1, Math.min(parseInt(c.req.query('count') ?? '5', 10) || 5, 50))
  const all = await collectDeadlines(userId)
  const item = all.find((d) => d.id === id)
  if (!item) return c.json({ error: 'Not found' }, 404)
  return c.json({
    id,
    label: item.label,
    description: describeExpression('oneoff', item.due_date, tz),
    firings: nextFirings('oneoff', item.due_date, tz, new Date().toISOString(), count),
  })
})

// ---------------------------------------------------------------------------
// GET /stream — SSE live countdown of the user's deadlines, bucketed each tick.
// ---------------------------------------------------------------------------
router.get('/stream', async (c) => {
  const userId = getUserId(c)
  return streamSSE(c, async (stream) => {
    let ticks = 0
    const maxTicks = 60
    while (!stream.closed && !stream.aborted && ticks < maxTicks) {
      const all = userId ? await collectDeadlines(userId) : []
      const now = Date.now()
      const payload = {
        at: new Date().toISOString(),
        overdue: all.filter((d) => d.bucket === 'overdue').length,
        due_soon: all.filter((d) => d.bucket === 'due_soon').length,
        upcoming: all.filter((d) => d.bucket === 'upcoming').length,
        next: all
          .filter((d) => new Date(d.due_date).getTime() >= now)
          .slice(0, 5)
          .map((d) => ({
            id: d.id,
            label: d.label,
            due_date: d.due_date,
            seconds_remaining: Math.max(0, Math.round((new Date(d.due_date).getTime() - now) / 1000)),
          })),
      }
      await stream.writeSSE({ event: 'deadlines', data: JSON.stringify(payload), id: String(ticks) })
      ticks++
      await stream.sleep(5000)
    }
  })
})

export default router
