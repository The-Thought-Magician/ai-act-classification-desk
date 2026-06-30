import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  ai_systems,
  obligations,
  evidence_requirements,
  registry_packages,
  classifications,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

const TIERS = ['prohibited', 'high', 'limited', 'minimal'] as const

function isoWeekKey(d: Date): string {
  // ISO-ish "YYYY-Www" key based on the Thursday of the week.
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000))
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function weekStart(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum)
  return date.toISOString().slice(0, 10)
}

// GET /overview — tier distribution, readiness %, top blocking requirements
router.get('/overview', async (c) => {
  const userId = getUserId(c)

  const systems = await db.select().from(ai_systems).where(eq(ai_systems.user_id, userId))
  const liveSystems = systems.filter((s) => !s.archived)

  // Tier distribution (only non-archived systems with an assigned tier).
  const tierDistribution: Record<string, number> = {
    prohibited: 0,
    high: 0,
    limited: 0,
    minimal: 0,
    unclassified: 0,
  }
  for (const s of liveSystems) {
    const t = s.current_tier && TIERS.includes(s.current_tier as (typeof TIERS)[number]) ? s.current_tier : 'unclassified'
    tierDistribution[t] = (tierDistribution[t] ?? 0) + 1
  }

  // Evidence readiness across the portfolio.
  const reqs = await db.select().from(evidence_requirements).where(eq(evidence_requirements.user_id, userId))
  const applicableReqs = reqs.filter((r) => r.status !== 'not_applicable')
  const approvedReqs = applicableReqs.filter((r) => r.status === 'approved')
  const evidenceReadinessPct = applicableReqs.length === 0 ? 0 : Math.round((approvedReqs.length / applicableReqs.length) * 1000) / 10

  // Obligation completion across the portfolio.
  const obls = await db.select().from(obligations).where(eq(obligations.user_id, userId))
  const applicableObls = obls.filter((o) => o.status !== 'not_applicable')
  const completeObls = applicableObls.filter((o) => o.status === 'complete')
  const obligationCompletionPct = applicableObls.length === 0 ? 0 : Math.round((completeObls.length / applicableObls.length) * 1000) / 10

  // Registry readiness (average of package readiness_pct).
  const packages = await db.select().from(registry_packages).where(eq(registry_packages.user_id, userId))
  const registryReadinessPct =
    packages.length === 0
      ? 0
      : Math.round((packages.reduce((acc, p) => acc + (p.readiness_pct ?? 0), 0) / packages.length) * 10) / 10

  // Top blocking requirements: most common requirement_code among non-approved required reqs.
  const blockingCounts = new Map<string, { requirement_code: string; title: string; category: string; count: number }>()
  for (const r of applicableReqs) {
    if (r.required && r.status !== 'approved') {
      const key = r.requirement_code
      const cur = blockingCounts.get(key) ?? { requirement_code: r.requirement_code, title: r.title, category: r.category, count: 0 }
      cur.count += 1
      blockingCounts.set(key, cur)
    }
  }
  const topBlockingRequirements = [...blockingCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10)

  // Registry status counts.
  const registryStatusCounts: Record<string, number> = { draft: 0, ready: 0, submitted: 0, registered: 0 }
  for (const p of packages) registryStatusCounts[p.status] = (registryStatusCounts[p.status] ?? 0) + 1

  return c.json({
    total_systems: liveSystems.length,
    tier_distribution: tierDistribution,
    evidence_readiness_pct: evidenceReadinessPct,
    obligation_completion_pct: obligationCompletionPct,
    registry_readiness_pct: registryReadinessPct,
    registry_status_counts: registryStatusCounts,
    top_blocking_requirements: topBlockingRequirements,
  })
})

// GET /trends — readiness trend, classifications-per-week, obligation burndown, evidence-gap trend
router.get('/trends', async (c) => {
  const userId = getUserId(c)

  const reqs = await db.select().from(evidence_requirements).where(eq(evidence_requirements.user_id, userId))
  const obls = await db.select().from(obligations).where(eq(obligations.user_id, userId))

  // System ids belonging to this user (classifications has no user_id column).
  const systems = await db.select().from(ai_systems).where(eq(ai_systems.user_id, userId))
  const systemIds = new Set(systems.map((s) => s.id))
  const allClassifications = await db.select().from(classifications).orderBy(desc(classifications.created_at))
  const userClassifications = allClassifications.filter((cl) => systemIds.has(cl.system_id))

  // Classifications-per-week (last 12 ISO weeks present in data).
  const perWeek = new Map<string, number>()
  for (const cl of userClassifications) {
    const d = cl.created_at ? new Date(cl.created_at as unknown as string) : new Date()
    const key = isoWeekKey(d)
    perWeek.set(key, (perWeek.get(key) ?? 0) + 1)
  }
  const classificationsPerWeek = [...perWeek.entries()]
    .map(([week, count]) => ({ week, count }))
    .sort((a, b) => a.week.localeCompare(b.week))

  // Build a daily timeline over the last 90 days for readiness / burndown / gap trends.
  const now = new Date()
  const days: string[] = []
  for (let i = 89; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86_400_000)
    days.push(d.toISOString().slice(0, 10))
  }
  const dayEnd = (iso: string) => new Date(`${iso}T23:59:59.999Z`).getTime()

  const applicableReqs = reqs.filter((r) => r.status !== 'not_applicable')
  const applicableObls = obls.filter((o) => o.status !== 'not_applicable')

  // Readiness trend: cumulative count of requirements created up to each day
  // vs those that reached approved status (approximated by updated_at).
  const readinessTrend = days.map((iso) => {
    const cutoff = dayEnd(iso)
    const created = applicableReqs.filter((r) => new Date(r.created_at as unknown as string).getTime() <= cutoff)
    const approved = created.filter(
      (r) => r.status === 'approved' && new Date((r.updated_at ?? r.created_at) as unknown as string).getTime() <= cutoff,
    )
    const pct = created.length === 0 ? 0 : Math.round((approved.length / created.length) * 1000) / 10
    return { date: iso, readiness_pct: pct, total: created.length, approved: approved.length }
  })

  // Obligation burndown: open (non-complete) obligations remaining at each day.
  const obligationBurndown = days.map((iso) => {
    const cutoff = dayEnd(iso)
    const created = applicableObls.filter((o) => new Date(o.created_at as unknown as string).getTime() <= cutoff)
    const completed = created.filter(
      (o) => o.status === 'complete' && new Date((o.updated_at ?? o.created_at) as unknown as string).getTime() <= cutoff,
    )
    return { date: iso, open: created.length - completed.length, total: created.length, complete: completed.length }
  })

  // Evidence-gap trend: number of required-but-not-approved requirements at each day.
  const evidenceGapTrend = days.map((iso) => {
    const cutoff = dayEnd(iso)
    const created = applicableReqs.filter((r) => r.required && new Date(r.created_at as unknown as string).getTime() <= cutoff)
    const closed = created.filter(
      (r) => r.status === 'approved' && new Date((r.updated_at ?? r.created_at) as unknown as string).getTime() <= cutoff,
    )
    return { date: iso, gaps: created.length - closed.length }
  })

  return c.json({
    classifications_per_week: classificationsPerWeek,
    readiness_trend: readinessTrend,
    obligation_burndown: obligationBurndown,
    evidence_gap_trend: evidenceGapTrend,
    week_starts: days.filter((_, i) => i % 7 === 0).map((iso) => weekStart(new Date(`${iso}T00:00:00Z`))),
  })
})

export default router
