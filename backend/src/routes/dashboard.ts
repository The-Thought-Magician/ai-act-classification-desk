import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  ai_systems,
  classifications,
  obligations,
  evidence_requirements,
  registry_packages,
  deadlines,
  role_events,
} from '../db/schema.js'
import { eq, and, desc } from 'drizzle-orm'
import { getUserId } from '../lib/auth.js'

const router = new Hono()

const DAY_MS = 86_400_000

// ---------------------------------------------------------------------------
// GET /summary — portfolio summary for the current user (public read, scoped).
//
// Aggregates: tier counts, obligation completion %, evidence gaps, registry
// status counts, upcoming deadlines, recent classifications, and recent role
// flips. All computed in-process from the user's own rows.
// ---------------------------------------------------------------------------
router.get('/summary', async (c) => {
  const userId = getUserId(c)
  if (!userId) {
    return c.json({
      systems_total: 0,
      tier_counts: { prohibited: 0, high: 0, limited: 0, minimal: 0, unclassified: 0 },
      obligations: { total: 0, complete: 0, completion_pct: 0 },
      evidence: { total: 0, gaps: 0, gap_pct: 0 },
      registry: { draft: 0, ready: 0, submitted: 0, registered: 0 },
      upcoming_deadlines: [],
      recent_classifications: [],
      recent_role_flips: [],
    })
  }

  const systems = await db
    .select()
    .from(ai_systems)
    .where(and(eq(ai_systems.user_id, userId), eq(ai_systems.archived, false)))
  const systemIds = new Set(systems.map((s) => s.id))

  // --- tier counts ---
  const tier_counts = { prohibited: 0, high: 0, limited: 0, minimal: 0, unclassified: 0 }
  for (const s of systems) {
    const t = s.current_tier
    if (t === 'prohibited') tier_counts.prohibited++
    else if (t === 'high') tier_counts.high++
    else if (t === 'limited') tier_counts.limited++
    else if (t === 'minimal') tier_counts.minimal++
    else tier_counts.unclassified++
  }

  // --- obligation completion ---
  const allObligations = await db.select().from(obligations).where(eq(obligations.user_id, userId))
  const obligationsScoped = allObligations.filter((o) => systemIds.has(o.system_id))
  const oblTotal = obligationsScoped.length
  const oblComplete = obligationsScoped.filter((o) => o.status === 'complete').length
  const completion_pct = oblTotal === 0 ? 0 : Math.round((oblComplete / oblTotal) * 100)

  // --- evidence gaps (missing/draft required requirements) ---
  const allEvidence = await db
    .select()
    .from(evidence_requirements)
    .where(eq(evidence_requirements.user_id, userId))
  const evidenceScoped = allEvidence.filter((e) => systemIds.has(e.system_id))
  const evTotal = evidenceScoped.length
  const evGaps = evidenceScoped.filter(
    (e) => e.required && (e.status === 'missing' || e.status === 'draft'),
  ).length
  const gap_pct = evTotal === 0 ? 0 : Math.round((evGaps / evTotal) * 100)

  // --- registry status counts ---
  const allRegistry = await db
    .select()
    .from(registry_packages)
    .where(eq(registry_packages.user_id, userId))
  const registry = { draft: 0, ready: 0, submitted: 0, registered: 0 }
  for (const r of allRegistry) {
    if (r.status === 'draft') registry.draft++
    else if (r.status === 'ready') registry.ready++
    else if (r.status === 'submitted') registry.submitted++
    else if (r.status === 'registered') registry.registered++
  }

  // --- upcoming deadlines (next 30 days, open) from obligations + custom + registry ---
  const now = Date.now()
  const horizon = now + 30 * DAY_MS
  const upcoming: Array<{ id: string; label: string; due_date: string; source: string; system_id: string | null }> = []

  for (const o of obligationsScoped) {
    if (!o.due_date || o.status === 'complete' || o.status === 'not_applicable') continue
    const t = new Date(o.due_date).getTime()
    if (t >= now && t <= horizon) {
      upcoming.push({ id: o.id, label: o.title, due_date: new Date(o.due_date).toISOString(), source: 'obligation', system_id: o.system_id })
    }
  }
  const customDeadlines = await db.select().from(deadlines).where(eq(deadlines.user_id, userId))
  for (const d of customDeadlines) {
    if (d.status !== 'open') continue
    const t = new Date(d.due_date).getTime()
    if (t >= now && t <= horizon) {
      upcoming.push({ id: d.id, label: d.label, due_date: new Date(d.due_date).toISOString(), source: d.source, system_id: d.system_id })
    }
  }
  upcoming.sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime())

  // --- recent classifications (across user's systems) ---
  const recentClass: Array<{ id: string; system_id: string; system_name: string; tier: string; created_at: string }> = []
  const allClass = systemIds.size
    ? await db.select().from(classifications).orderBy(desc(classifications.created_at))
    : []
  const nameById = new Map(systems.map((s) => [s.id, s.name]))
  for (const cl of allClass) {
    if (!systemIds.has(cl.system_id)) continue
    recentClass.push({
      id: cl.id,
      system_id: cl.system_id,
      system_name: nameById.get(cl.system_id) ?? '',
      tier: cl.tier,
      created_at: new Date(cl.created_at).toISOString(),
    })
    if (recentClass.length >= 10) break
  }

  // --- recent role flips ---
  const flips = await db
    .select()
    .from(role_events)
    .where(and(eq(role_events.user_id, userId), eq(role_events.flipped, true)))
    .orderBy(desc(role_events.created_at))
    .limit(10)
  const recent_role_flips = flips.map((f) => ({
    id: f.id,
    system_id: f.system_id,
    system_name: nameById.get(f.system_id) ?? '',
    event_type: f.event_type,
    before_role: f.before_role,
    after_role: f.after_role,
    created_at: new Date(f.created_at).toISOString(),
  }))

  return c.json({
    systems_total: systems.length,
    tier_counts,
    obligations: { total: oblTotal, complete: oblComplete, completion_pct },
    evidence: { total: evTotal, gaps: evGaps, gap_pct },
    registry,
    upcoming_deadlines: upcoming.slice(0, 10),
    recent_classifications: recentClass,
    recent_role_flips,
  })
})

export default router
