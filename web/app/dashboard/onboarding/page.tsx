'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { PageSpinner } from '@/components/ui/Spinner'

interface StepDef {
  key: string
  title: string
  description: string
  href: string
  cta: string
}

// Canonical onboarding checklist for the AI Act Classification Desk.
const STEP_DEFS: StepDef[] = [
  {
    key: 'add_system',
    title: 'Register your first AI system',
    description: 'Capture intended purpose, modality, geographies, and operator role for a system in scope.',
    href: '/dashboard/systems/new',
    cta: 'Add a system',
  },
  {
    key: 'run_classification',
    title: 'Run a risk classification',
    description: 'Answer the questionnaire to get a deterministic, Article-cited risk tier for a system.',
    href: '/dashboard/systems',
    cta: 'Classify a system',
  },
  {
    key: 'review_obligations',
    title: 'Review generated obligations',
    description: 'Each tier auto-generates Article-referenced obligations. Assign owners and due dates.',
    href: '/dashboard/obligations',
    cta: 'Open obligations',
  },
  {
    key: 'upload_evidence',
    title: 'Attach evidence',
    description: 'Close evidence gaps by linking artifacts to high-risk requirements.',
    href: '/dashboard/evidence',
    cta: 'Open evidence',
  },
  {
    key: 'draft_notice',
    title: 'Draft a transparency notice',
    description: 'Generate Article 50 disclosures from templates for limited-risk systems.',
    href: '/dashboard/notices',
    cta: 'Open notices',
  },
  {
    key: 'prepare_registry',
    title: 'Prepare a registry package',
    description: 'Build an EU database submission package for high-risk systems and check readiness.',
    href: '/dashboard/registry',
    cta: 'Open registry',
  },
  {
    key: 'configure_workspace',
    title: 'Configure your workspace',
    description: 'Set organisation defaults, jurisdiction, and notification preferences.',
    href: '/dashboard/settings',
    cta: 'Open settings',
  },
]

interface OnboardingProgress {
  steps?: unknown
  dismissed?: boolean
  [key: string]: unknown
}

// Normalises whatever shape `steps` is into a key -> done map.
function normalizeSteps(raw: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {}
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') {
        out[item] = true
      } else if (item && typeof item === 'object') {
        const o = item as Record<string, unknown>
        const k = (o.key ?? o.id ?? o.name) as string | undefined
        if (k) out[k] = Boolean(o.done ?? o.complete ?? o.completed ?? true)
      }
    }
  } else if (raw && typeof raw === 'object') {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v
      else if (v && typeof v === 'object') {
        const o = v as Record<string, unknown>
        out[k] = Boolean(o.done ?? o.complete ?? o.completed ?? true)
      } else {
        out[k] = Boolean(v)
      }
    }
  }
  return out
}

type Summary = Record<string, unknown>

function num(v: unknown): number {
  if (typeof v === 'number') return v
  if (Array.isArray(v)) return v.length
  if (v && typeof v === 'object') {
    return Object.values(v as Record<string, unknown>).reduce<number>(
      (a, b) => a + (typeof b === 'number' ? b : 0),
      0,
    )
  }
  return 0
}

// Best-effort signals from the dashboard summary, used to suggest auto-completable steps.
function deriveSignals(summary: Summary | null): Record<string, boolean> {
  if (!summary) return {}
  const tierCounts = summary.tier_counts ?? summary.tierCounts ?? summary.tiers
  const systemsCount =
    num(summary.systems) ||
    num(summary.system_count) ||
    num(summary.total_systems) ||
    num(tierCounts)
  const obligations = num(summary.obligations) || num(summary.obligation_count)
  const completion =
    num(summary.obligation_completion_pct) || num(summary.completion_pct)
  const recentClassifications =
    num(summary.recent_classifications) || num(summary.recentClassifications)
  return {
    add_system: systemsCount > 0,
    run_classification: recentClassifications > 0 || (Boolean(tierCounts) && systemsCount > 0),
    review_obligations: obligations > 0 || completion > 0,
  }
}

export default function OnboardingPage() {
  const [progress, setProgress] = useState<OnboardingProgress | null>(null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [done, setDone] = useState<Record<string, boolean>>({})
  const [dismissed, setDismissed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [p, s] = await Promise.all([
        api.getOnboarding(),
        api.getDashboardSummary().catch(() => null),
      ])
      const prog = (p ?? {}) as OnboardingProgress
      setProgress(prog)
      setDone(normalizeSteps(prog.steps))
      setDismissed(Boolean(prog.dismissed))
      setSummary((s ?? null) as Summary | null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load onboarding')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const signals = useMemo(() => deriveSignals(summary), [summary])

  // Effective completion = explicitly marked OR detected from portfolio signals.
  const effective = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const def of STEP_DEFS) {
      out[def.key] = Boolean(done[def.key]) || Boolean(signals[def.key])
    }
    return out
  }, [done, signals])

  const completedCount = STEP_DEFS.filter((d) => effective[d.key]).length
  const total = STEP_DEFS.length
  const pct = total ? Math.round((completedCount / total) * 100) : 0

  async function persist(nextDone: Record<string, boolean>, nextDismissed: boolean) {
    setSaving(true)
    setError(null)
    try {
      const updated = (await api.updateOnboarding({
        steps: nextDone,
        dismissed: nextDismissed,
      })) as OnboardingProgress
      if (updated) {
        setProgress(updated)
        if (updated.steps !== undefined) setDone(normalizeSteps(updated.steps))
        if (updated.dismissed !== undefined) setDismissed(Boolean(updated.dismissed))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save progress')
      // revert on failure
      setDone(normalizeSteps(progress?.steps))
      setDismissed(Boolean(progress?.dismissed))
    } finally {
      setSaving(false)
    }
  }

  function toggle(key: string) {
    const next = { ...done, [key]: !(done[key] ?? false) }
    setDone(next)
    persist(next, dismissed)
  }

  function setDismissedState(v: boolean) {
    setDismissed(v)
    persist(done, v)
  }

  function markAllDone() {
    const next: Record<string, boolean> = {}
    for (const d of STEP_DEFS) next[d.key] = true
    setDone(next)
    persist(next, dismissed)
  }

  if (loading) return <PageSpinner label="Loading onboarding..." />

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-1 py-2">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100">Getting started</h1>
          <p className="text-sm text-slate-400">
            A guided checklist to stand up your EU AI Act compliance workflow end to end.
          </p>
        </div>
        {dismissed ? (
          <Badge tone="slate">Dismissed</Badge>
        ) : (
          <Button variant="ghost" onClick={() => setDismissedState(true)} disabled={saving}>
            Dismiss
          </Button>
        )}
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Progress card */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Overall progress</div>
              <div className="mt-1 text-3xl font-bold text-indigo-300">
                {pct}%
              </div>
              <div className="text-xs text-slate-400">
                {completedCount} of {total} steps complete
              </div>
            </div>
            {pct === 100 ? (
              <Badge tone="green">All set</Badge>
            ) : (
              <Button variant="secondary" onClick={markAllDone} disabled={saving}>
                Mark all complete
              </Button>
            )}
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-amber-400 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
        </CardBody>
      </Card>

      {dismissed && (
        <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-400">
          You dismissed the onboarding checklist.{' '}
          <button onClick={() => setDismissedState(false)} className="text-indigo-300 underline-offset-2 hover:underline">
            Restore it
          </button>
          .
        </div>
      )}

      {/* Checklist */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-100">Setup checklist</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Steps auto-detect from your portfolio where possible. You can also tick them manually.
          </p>
        </CardHeader>
        <CardBody className="space-y-2.5">
          {STEP_DEFS.map((def, i) => {
            const isDone = effective[def.key]
            const autoDetected = !done[def.key] && Boolean(signals[def.key])
            return (
              <div
                key={def.key}
                className={`flex flex-col gap-3 rounded-lg border px-4 py-3.5 transition-colors sm:flex-row sm:items-center ${
                  isDone ? 'border-emerald-500/30 bg-emerald-500/[0.06]' : 'border-slate-800 bg-slate-950/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(def.key)}
                  disabled={saving}
                  aria-label={isDone ? 'Mark incomplete' : 'Mark complete'}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors ${
                    isDone
                      ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                      : 'border-slate-600 text-transparent hover:border-indigo-400'
                  }`}
                >
                  ✓
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-500">{i + 1}.</span>
                    <span className={`text-sm font-medium ${isDone ? 'text-slate-300 line-through' : 'text-slate-100'}`}>
                      {def.title}
                    </span>
                    {autoDetected && <Badge tone="indigo">Detected</Badge>}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">{def.description}</p>
                </div>
                <div className="shrink-0">
                  <Link href={def.href}>
                    <Button variant={isDone ? 'ghost' : 'secondary'}>{def.cta}</Button>
                  </Link>
                </div>
              </div>
            )
          })}
        </CardBody>
      </Card>

      {pct === 100 && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-200">
          Your compliance desk is fully set up. Head to the{' '}
          <Link href="/dashboard" className="font-medium underline-offset-2 hover:underline">dashboard</Link>{' '}
          for your portfolio overview.
        </div>
      )}
    </div>
  )
}
