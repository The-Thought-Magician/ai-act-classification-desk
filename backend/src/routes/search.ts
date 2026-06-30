import { Hono } from 'hono'
import { db } from '../db/index.js'
import {
  ai_systems,
  obligations,
  evidence_requirements,
  transparency_notices,
  registry_packages,
} from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { getUserId } from '../lib/auth.js'

const router = new Hono()

type TypedResult = {
  type: 'system' | 'obligation' | 'evidence' | 'notice' | 'registry'
  id: string
  system_id: string | null
  title: string
  subtitle: string
  href: string
  matched_on: string
}

function matches(needle: string, ...haystacks: Array<string | null | undefined>): string | null {
  for (const h of haystacks) {
    if (h && h.toLowerCase().includes(needle)) return h
  }
  return null
}

// GET / — global typed search across systems / obligations / evidence / notices / registry
router.get('/', async (c) => {
  const userId = getUserId(c)
  const q = (c.req.query('q') ?? '').trim()
  if (q.length === 0) return c.json({ results: [] as TypedResult[] })
  const needle = q.toLowerCase()

  const results: TypedResult[] = []

  // Systems (owned by user).
  const systems = await db.select().from(ai_systems).where(eq(ai_systems.user_id, userId))
  const systemName = new Map(systems.map((s) => [s.id, s.name]))
  for (const s of systems) {
    const m = matches(
      needle,
      s.name,
      s.description,
      s.intended_purpose,
      s.purpose_category,
      s.role,
      s.current_tier,
      (s.tags ?? []).join(' '),
    )
    if (m) {
      results.push({
        type: 'system',
        id: s.id,
        system_id: s.id,
        title: s.name,
        subtitle: `${s.role}${s.current_tier ? ` · ${s.current_tier}` : ''} · ${s.status}`,
        href: `/dashboard/systems/${s.id}`,
        matched_on: m,
      })
    }
  }

  // Obligations.
  const obls = await db.select().from(obligations).where(eq(obligations.user_id, userId))
  for (const o of obls) {
    const m = matches(needle, o.title, o.description, o.article_ref, o.template_code, o.owner)
    if (m) {
      results.push({
        type: 'obligation',
        id: o.id,
        system_id: o.system_id,
        title: o.title,
        subtitle: `${o.article_ref} · ${o.status}${o.system_id ? ` · ${systemName.get(o.system_id) ?? ''}` : ''}`,
        href: `/dashboard/obligations`,
        matched_on: m,
      })
    }
  }

  // Evidence requirements.
  const reqs = await db.select().from(evidence_requirements).where(eq(evidence_requirements.user_id, userId))
  for (const r of reqs) {
    const m = matches(needle, r.title, r.description, r.requirement_code, r.category, r.reviewer, r.notes)
    if (m) {
      results.push({
        type: 'evidence',
        id: r.id,
        system_id: r.system_id,
        title: r.title,
        subtitle: `${r.category} · ${r.status}${r.system_id ? ` · ${systemName.get(r.system_id) ?? ''}` : ''}`,
        href: `/dashboard/evidence`,
        matched_on: m,
      })
    }
  }

  // Transparency notices.
  const notices = await db.select().from(transparency_notices).where(eq(transparency_notices.user_id, userId))
  for (const n of notices) {
    const m = matches(needle, n.trigger_code, n.body, n.locale)
    if (m) {
      results.push({
        type: 'notice',
        id: n.id,
        system_id: n.system_id,
        title: `${n.trigger_code} (v${n.version})`,
        subtitle: `${n.locale} · ${n.published ? 'published' : 'draft'}${n.system_id ? ` · ${systemName.get(n.system_id) ?? ''}` : ''}`,
        href: `/dashboard/notices`,
        matched_on: m,
      })
    }
  }

  // Registry packages.
  const packages = await db.select().from(registry_packages).where(eq(registry_packages.user_id, userId))
  for (const p of packages) {
    const fieldsText: string = (() => {
      try {
        return JSON.stringify(p.fields ?? {})
      } catch {
        return ''
      }
    })()
    const sysName = p.system_id ? systemName.get(p.system_id) ?? '' : ''
    const m = matches(needle, p.status, p.registered_reference, sysName, fieldsText)
    if (m) {
      results.push({
        type: 'registry',
        id: p.id,
        system_id: p.system_id,
        title: `Registry package${sysName ? ` · ${sysName}` : ''}`,
        subtitle: `${p.status} · ${Math.round(p.readiness_pct ?? 0)}% ready`,
        href: `/dashboard/registry`,
        matched_on: m,
      })
    }
  }

  return c.json({ results })
})

export default router
