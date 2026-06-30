import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { db } from '../db/index.js'
import { onboarding_progress } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// The canonical first-run checklist steps. Stored per user in
// onboarding_progress.steps as a { [stepKey]: boolean } map.
const STEP_KEYS = [
  'create_system',
  'run_classification',
  'review_obligations',
  'link_evidence',
  'view_dashboard',
] as const

type StepKey = (typeof STEP_KEYS)[number]
type Steps = Record<StepKey, boolean>

function normalizeSteps(stored: unknown): Steps {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>
  const out = {} as Steps
  for (const key of STEP_KEYS) {
    out[key] = s[key] === true
  }
  return out
}

async function loadOrCreate(userId: string) {
  const [row] = await db
    .select()
    .from(onboarding_progress)
    .where(eq(onboarding_progress.user_id, userId))
    .limit(1)
  if (row) {
    return { ...row, steps: normalizeSteps(row.steps) }
  }
  const steps = normalizeSteps({})
  const [created] = await db
    .insert(onboarding_progress)
    .values({ user_id: userId, steps, dismissed: false })
    .onConflictDoNothing({ target: onboarding_progress.user_id })
    .returning()
  if (created) return { ...created, steps: normalizeSteps(created.steps) }
  // Lost the insert race: read the row that the other request created.
  const [existing] = await db
    .select()
    .from(onboarding_progress)
    .where(eq(onboarding_progress.user_id, userId))
    .limit(1)
  return { ...existing, steps: normalizeSteps(existing.steps) }
}

// GET / — onboarding progress for the current user (auto-create on first read).
router.get('/', authMiddleware, async (c) => {
  const userId = getUserId(c)
  const progress = await loadOrCreate(userId)
  return c.json(progress)
})

const updateSchema = z
  .object({
    steps: z.record(z.enum(STEP_KEYS), z.boolean()).optional(),
    dismissed: z.boolean().optional(),
  })
  .refine((b) => b.steps !== undefined || b.dismissed !== undefined, {
    message: 'Provide steps and/or dismissed',
  })

// PUT / — update step completion and/or dismissed flag.
router.put('/', authMiddleware, zValidator('json', updateSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')
  const current = await loadOrCreate(userId)

  const nextSteps = normalizeSteps({ ...current.steps, ...(body.steps ?? {}) })
  const nextDismissed = body.dismissed ?? current.dismissed

  const [updated] = await db
    .update(onboarding_progress)
    .set({ steps: nextSteps, dismissed: nextDismissed, updated_at: new Date() })
    .where(eq(onboarding_progress.user_id, userId))
    .returning()

  return c.json({ ...updated, steps: normalizeSteps(updated.steps) })
})

export default router
