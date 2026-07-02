'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Stat } from '@/components/ui/Stat'
import { Badge, tierTone, statusTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

// Loose response shapes — the backend summary aggregates many counts. We read
// defensively so the page degrades gracefully if a field is absent.
type TierCounts = Record<string, number>
type RegistryCounts = Record<string, number>

interface DeadlineItem {
  id?: string
  label?: string
  title?: string
  due_date?: string
  source?: string
  status?: string
  system_id?: string
}

interface RecentClassification {
  id?: string
  system_id?: string
  system_name?: string
  tier?: string
  created_at?: string
  is_override?: boolean
}

interface RecentRoleFlip {
  id?: string
  system_id?: string
  system_name?: string
  before_role?: string
  after_role?: string
  created_at?: string
}

interface DashboardSummary {
  total_systems?: number
  tier_counts?: TierCounts
  obligation_completion_pct?: number
  obligations_total?: number
  obligations_complete?: number
  evidence_gaps?: number
  systems_below_threshold?: number
  registry_status_counts?: RegistryCounts
  upcoming_deadlines?: DeadlineItem[]
  recent_classifications?: RecentClassification[]
  recent_role_flips?: RecentRoleFlip[]
}

interface DeadlinesResponse {
  overdue?: DeadlineItem[]
  due_soon?: DeadlineItem[]
  upcoming?: DeadlineItem[]
}

const TIER_ORDER = ['prohibited', 'high', 'limited', 'minimal'] as const
const TIER_LABEL: Record<string, string> = {
  prohibited: 'Prohibited',
  high: 'High Risk',
  limited: 'Limited Risk',
  minimal: 'Minimal Risk',
}
const TIER_BAR: Record<string, string> = {
  prohibited: 'bg-red-500',
  high: 'bg-amber-500',
  limited: 'bg-orange-500',
  minimal: 'bg-green-500',
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function daysUntil(s?: string): number | null {
  if (!s) return null
  const d = new Date(s)
  if (isNaN(d.getTime())) return null
  return Math.round((d.getTime() - Date.now()) / 86_400_000)
}

function deadlineLabel(d: DeadlineItem): string {
  return d.label || d.title || 'Deadline'
}

export default function DashboardPage() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [deadlines, setDeadlines] = useState<DeadlinesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    Promise.all([api.getDashboardSummary(), api.getDeadlines()])
      .then(([s, d]) => {
        if (!active) return
        setSummary(s as DashboardSummary)
        setDeadlines(d as DeadlinesResponse)
      })
      .catch((e) => {
        if (active) setError(e?.message || 'Failed to load dashboard.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  if (loading) return <PageSpinner label="Loading portfolio..." />

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">Portfolio Overview</h1>
        <Card>
          <CardBody>
            <EmptyState
              title="Could not load the dashboard"
              description={error}
              action={
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              }
            />
          </CardBody>
        </Card>
      </div>
    )
  }

  const s = summary ?? {}
  const tierCounts: TierCounts = s.tier_counts ?? {}
  const totalSystems =
    s.total_systems ?? TIER_ORDER.reduce((acc, t) => acc + (tierCounts[t] ?? 0), 0)

  const completionPct =
    s.obligation_completion_pct ??
    (s.obligations_total
      ? Math.round(((s.obligations_complete ?? 0) / s.obligations_total) * 100)
      : 0)

  const evidenceGaps = s.evidence_gaps ?? 0
  const registryCounts: RegistryCounts = s.registry_status_counts ?? {}

  const overdue = deadlines?.overdue ?? []
  const dueSoon = deadlines?.due_soon ?? []
  const upcoming = s.upcoming_deadlines ?? deadlines?.upcoming ?? []

  const recentClassifications = s.recent_classifications ?? []
  const recentRoleFlips = s.recent_role_flips ?? []

  const tierMax = Math.max(1, ...TIER_ORDER.map((t) => tierCounts[t] ?? 0))

  const hasAnyData =
    totalSystems > 0 ||
    overdue.length > 0 ||
    dueSoon.length > 0 ||
    upcoming.length > 0 ||
    recentClassifications.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Portfolio Overview</h1>
          <p className="mt-1 text-sm text-stone-400">
            EU AI Act compliance posture across every registered system.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/systems">
            <Button variant="secondary">View systems</Button>
          </Link>
          <Link href="/dashboard/systems/new">
            <Button>Register system</Button>
          </Link>
        </div>
      </div>

      {!hasAnyData && (
        <Card>
          <CardBody>
            <EmptyState
              title="Your portfolio is empty"
              description="Register your first AI system to run the deterministic classifier and start tracking obligations, evidence, and deadlines."
              action={
                <Link href="/dashboard/systems/new">
                  <Button>Register a system</Button>
                </Link>
              }
            />
          </CardBody>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="AI Systems" value={totalSystems} accent="indigo" hint="In the register" />
        <Stat
          label="Obligation Completion"
          value={`${completionPct}%`}
          accent={completionPct >= 80 ? 'green' : completionPct >= 40 ? 'amber' : 'red'}
          hint={
            s.obligations_total
              ? `${s.obligations_complete ?? 0} of ${s.obligations_total} complete`
              : 'Across the portfolio'
          }
        />
        <Stat
          label="Evidence Gaps"
          value={evidenceGaps}
          accent={evidenceGaps === 0 ? 'green' : 'amber'}
          hint={
            s.systems_below_threshold != null
              ? `${s.systems_below_threshold} systems below threshold`
              : 'Required items missing'
          }
        />
        <Stat
          label="Overdue Deadlines"
          value={overdue.length}
          accent={overdue.length === 0 ? 'green' : 'red'}
          hint={`${dueSoon.length} due soon`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tier distribution */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-200">Risk-Tier Distribution</h2>
            <span className="text-xs text-stone-500">{totalSystems} classified</span>
          </CardHeader>
          <CardBody className="space-y-4">
            {totalSystems === 0 ? (
              <p className="text-sm text-stone-500">No systems classified yet.</p>
            ) : (
              TIER_ORDER.map((tier) => {
                const count = tierCounts[tier] ?? 0
                const pct = Math.round((count / tierMax) * 100)
                return (
                  <div key={tier}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-stone-300">{TIER_LABEL[tier]}</span>
                      <span className="text-stone-500">{count}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-800">
                      <div
                        className={`h-full rounded-full ${TIER_BAR[tier]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                )
              })
            )}
          </CardBody>
        </Card>

        {/* Registry status */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-200">Registry Status</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {Object.keys(registryCounts).length === 0 ? (
              <p className="text-sm text-stone-500">No registry packages yet.</p>
            ) : (
              Object.entries(registryCounts).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between">
                  <Badge tone={statusTone(status)}>{status.replace(/_/g, ' ')}</Badge>
                  <span className="text-sm font-semibold text-stone-200">{count}</span>
                </div>
              ))
            )}
            <Link
              href="/dashboard/registry"
              className="mt-2 block text-xs font-medium text-rose-400 hover:text-rose-300"
            >
              Open registry →
            </Link>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming deadlines */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-stone-200">Deadlines</h2>
            <Link
              href="/dashboard/deadlines"
              className="text-xs font-medium text-rose-400 hover:text-rose-300"
            >
              View all →
            </Link>
          </CardHeader>
          <CardBody className="space-y-2">
            {overdue.length === 0 && dueSoon.length === 0 && upcoming.length === 0 ? (
              <p className="text-sm text-stone-500">No deadlines tracked.</p>
            ) : (
              [
                ...overdue.map((d) => ({ d, bucket: 'overdue' as const })),
                ...dueSoon.map((d) => ({ d, bucket: 'due_soon' as const })),
                ...upcoming.map((d) => ({ d, bucket: 'upcoming' as const })),
              ]
                .slice(0, 8)
                .map(({ d, bucket }, i) => {
                  const days = daysUntil(d.due_date)
                  return (
                    <div
                      key={d.id || `${bucket}-${i}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-stone-200">{deadlineLabel(d)}</div>
                        <div className="text-xs text-stone-500">
                          {d.source ? `${d.source} · ` : ''}
                          {fmtDate(d.due_date)}
                        </div>
                      </div>
                      <Badge
                        tone={bucket === 'overdue' ? 'red' : bucket === 'due_soon' ? 'amber' : 'slate'}
                      >
                        {bucket === 'overdue'
                          ? `${days != null ? Math.abs(days) : ''}d overdue`
                          : days != null
                            ? `${days}d`
                            : bucket.replace('_', ' ')}
                      </Badge>
                    </div>
                  )
                })
            )}
          </CardBody>
        </Card>

        {/* Recent activity */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-stone-200">Recent Activity</h2>
          </CardHeader>
          <CardBody className="space-y-2">
            {recentClassifications.length === 0 && recentRoleFlips.length === 0 ? (
              <p className="text-sm text-stone-500">No recent classifications or role changes.</p>
            ) : (
              <>
                {recentClassifications.slice(0, 6).map((c, i) => (
                  <Link
                    key={c.id || `clf-${i}`}
                    href={c.system_id ? `/dashboard/systems/${c.system_id}` : '/dashboard/systems'}
                    className="flex items-center justify-between gap-3 rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2 hover:border-rose-500/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-stone-200">
                        {c.system_name || 'System'} classified
                        {c.is_override ? ' (override)' : ''}
                      </div>
                      <div className="text-xs text-stone-500">{fmtDate(c.created_at)}</div>
                    </div>
                    <Badge tone={tierTone(c.tier)}>{c.tier ? TIER_LABEL[c.tier] || c.tier : '—'}</Badge>
                  </Link>
                ))}
                {recentRoleFlips.slice(0, 4).map((r, i) => (
                  <Link
                    key={r.id || `flip-${i}`}
                    href={r.system_id ? `/dashboard/systems/${r.system_id}` : '/dashboard/roles'}
                    className="flex items-center justify-between gap-3 rounded-lg border border-stone-800 bg-stone-900/40 px-3 py-2 hover:border-rose-500/40"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm text-stone-200">
                        {r.system_name || 'System'} role flip
                      </div>
                      <div className="text-xs text-stone-500">
                        {r.before_role || '?'} → {r.after_role || '?'} · {fmtDate(r.created_at)}
                      </div>
                    </div>
                    <Badge tone="amber">role</Badge>
                  </Link>
                ))}
              </>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
