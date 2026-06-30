'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, tierTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface TierBucket {
  tier: string
  count: number
}

interface BlockingRequirement {
  requirement_code?: string
  code?: string
  title?: string
  category?: string
  count: number
}

interface AnalyticsOverview {
  tier_distribution?: TierBucket[]
  total_systems?: number
  readiness_pct?: number
  avg_readiness_pct?: number
  obligation_completion_pct?: number
  evidence_gap_count?: number
  top_blocking_requirements?: BlockingRequirement[]
}

interface TrendPoint {
  date?: string
  week?: string
  label?: string
  value?: number
  count?: number
  pct?: number
}

interface AnalyticsTrends {
  readiness_trend?: TrendPoint[]
  classifications_per_week?: TrendPoint[]
  obligation_burndown?: TrendPoint[]
  evidence_gap_trend?: TrendPoint[]
}

const TIER_ORDER = ['prohibited', 'high', 'limited', 'minimal']
const TIER_HEX: Record<string, string> = {
  prohibited: '#f87171',
  high: '#fbbf24',
  limited: '#38bdf8',
  minimal: '#34d399',
}

function ptValue(p: TrendPoint): number {
  return p.value ?? p.count ?? p.pct ?? 0
}

function ptLabel(p: TrendPoint): string {
  const raw = p.label ?? p.date ?? p.week ?? ''
  if (!raw) return ''
  const d = new Date(raw)
  if (!isNaN(d.getTime()) && /\d{4}-\d{2}/.test(raw)) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  return raw
}

function num(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return isNaN(n) ? fallback : n
}

// Simple SVG line chart, no external libs.
function LineChart({ points, color, suffix = '' }: { points: TrendPoint[]; color: string; suffix?: string }) {
  const w = 520
  const h = 160
  const pad = { top: 12, right: 12, bottom: 22, left: 32 }
  const iw = w - pad.left - pad.right
  const ih = h - pad.top - pad.bottom
  const vals = points.map(ptValue)
  const max = Math.max(1, ...vals)
  const min = Math.min(0, ...vals)
  const range = max - min || 1
  const stepX = points.length > 1 ? iw / (points.length - 1) : 0
  const coords = points.map((p, i) => {
    const x = pad.left + i * stepX
    const y = pad.top + ih - ((ptValue(p) - min) / range) * ih
    return [x, y] as const
  })
  const path = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${path} L${coords[coords.length - 1]?.[0].toFixed(1)},${pad.top + ih} L${pad.left},${pad.top + ih} Z`
  const gridLines = [0, 0.5, 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
      {gridLines.map((g) => {
        const y = pad.top + ih - g * ih
        const v = Math.round(min + g * range)
        return (
          <g key={g}>
            <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#1e293b" strokeWidth={1} />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">{v}{suffix}</text>
          </g>
        )
      })}
      {coords.length > 0 && (
        <>
          <path d={area} fill={color} fillOpacity={0.12} />
          <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {coords.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={2.5} fill={color} />
          ))}
        </>
      )}
      {points.map((p, i) => {
        if (points.length > 8 && i % Math.ceil(points.length / 8) !== 0) return null
        return (
          <text key={i} x={pad.left + i * stepX} y={h - 6} textAnchor="middle" fontSize="9" fill="#64748b">
            {ptLabel(p)}
          </text>
        )
      })}
    </svg>
  )
}

// Vertical bar chart via SVG.
function BarChart({ points, color, suffix = '' }: { points: TrendPoint[]; color: string; suffix?: string }) {
  const w = 520
  const h = 160
  const pad = { top: 12, right: 12, bottom: 22, left: 32 }
  const iw = w - pad.left - pad.right
  const ih = h - pad.top - pad.bottom
  const vals = points.map(ptValue)
  const max = Math.max(1, ...vals)
  const slot = iw / Math.max(1, points.length)
  const barW = Math.min(38, slot * 0.6)

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img">
      {[0, 0.5, 1].map((g) => {
        const y = pad.top + ih - g * ih
        return (
          <g key={g}>
            <line x1={pad.left} y1={y} x2={w - pad.right} y2={y} stroke="#1e293b" strokeWidth={1} />
            <text x={pad.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#64748b">{Math.round(g * max)}{suffix}</text>
          </g>
        )
      })}
      {points.map((p, i) => {
        const v = ptValue(p)
        const bh = (v / max) * ih
        const x = pad.left + i * slot + (slot - barW) / 2
        const y = pad.top + ih - bh
        return (
          <g key={i}>
            <rect x={x} y={y} width={barW} height={bh} rx={3} fill={color} fillOpacity={0.85}>
              <title>{`${ptLabel(p)}: ${v}${suffix}`}</title>
            </rect>
            <text x={x + barW / 2} y={h - 6} textAnchor="middle" fontSize="9" fill="#64748b">{ptLabel(p)}</text>
          </g>
        )
      })}
    </svg>
  )
}

function ChartCard({ title, subtitle, children, empty }: { title: string; subtitle?: string; children: React.ReactNode; empty: boolean }) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </CardHeader>
      <CardBody>
        {empty ? (
          <p className="py-10 text-center text-sm text-slate-500">No data for this period yet.</p>
        ) : (
          children
        )}
      </CardBody>
    </Card>
  )
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [trends, setTrends] = useState<AnalyticsTrends | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const [ov, tr] = await Promise.all([api.getAnalyticsOverview(), api.getAnalyticsTrends()])
      setOverview(ov ?? {})
      setTrends(tr ?? {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const tierDist = useMemo<TierBucket[]>(() => {
    const raw = overview?.tier_distribution ?? []
    const byTier = new Map<string, number>()
    for (const b of raw) byTier.set((b.tier ?? '').toLowerCase(), num(b.count))
    const ordered = TIER_ORDER.map((t) => ({ tier: t, count: byTier.get(t) ?? 0 }))
    // include any extra tiers not in the standard order
    for (const [t, c] of byTier) {
      if (!TIER_ORDER.includes(t)) ordered.push({ tier: t || 'unclassified', count: c })
    }
    return ordered
  }, [overview])

  const totalSystems = useMemo(
    () => overview?.total_systems ?? tierDist.reduce((a, b) => a + b.count, 0),
    [overview, tierDist],
  )
  const maxTier = Math.max(1, ...tierDist.map((t) => t.count))

  const readiness = num(overview?.readiness_pct ?? overview?.avg_readiness_pct, 0)
  const completion = num(overview?.obligation_completion_pct, 0)
  const gaps = num(overview?.evidence_gap_count, 0)
  const blocking = overview?.top_blocking_requirements ?? []

  if (loading) return <PageSpinner label="Loading analytics..." />

  const hasAny =
    tierDist.some((t) => t.count > 0) ||
    totalSystems > 0 ||
    (trends && Object.values(trends).some((a) => Array.isArray(a) && a.length > 0))

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Analytics</h1>
          <p className="mt-1 text-sm text-slate-400">
            Portfolio risk distribution, registry readiness, and compliance trends over time.
          </p>
        </div>
        <Button variant="secondary" onClick={() => { setLoading(true); load() }}>Refresh</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => { setLoading(true); load() }} className="ml-3 underline hover:text-red-200">
            Retry
          </button>
        </div>
      )}

      {!error && !hasAny ? (
        <EmptyState
          title="No analytics yet"
          description="Classify some AI systems and complete obligations to populate distribution and trend charts."
          icon="📊"
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Stat label="Systems" value={totalSystems} accent="indigo" />
            <Stat label="Avg readiness" value={`${readiness.toFixed(0)}%`} accent="green" />
            <Stat label="Obligation completion" value={`${completion.toFixed(0)}%`} accent="amber" />
            <Stat label="Evidence gaps" value={gaps} accent="red" />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-200">Risk tier distribution</h2>
                <p className="mt-0.5 text-xs text-slate-500">Systems classified by EU AI Act risk tier</p>
              </CardHeader>
              <CardBody>
                {tierDist.every((t) => t.count === 0) ? (
                  <p className="py-10 text-center text-sm text-slate-500">No classified systems yet.</p>
                ) : (
                  <div className="space-y-3">
                    {tierDist.map((t) => {
                      const pct = totalSystems > 0 ? (t.count / Math.max(1, totalSystems)) * 100 : 0
                      return (
                        <div key={t.tier}>
                          <div className="mb-1 flex items-center justify-between text-sm">
                            <span className="flex items-center gap-2">
                              <Badge tone={tierTone(t.tier)}>{t.tier}</Badge>
                            </span>
                            <span className="text-slate-400">{t.count} · {pct.toFixed(0)}%</span>
                          </div>
                          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${(t.count / maxTier) * 100}%`, background: TIER_HEX[t.tier] ?? '#818cf8' }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-sm font-semibold text-slate-200">Compliance readiness</h2>
                <p className="mt-0.5 text-xs text-slate-500">Average registry readiness and obligation progress</p>
              </CardHeader>
              <CardBody>
                <div className="flex items-center justify-around gap-4 py-2">
                  {[
                    { label: 'Readiness', val: readiness, color: '#34d399' },
                    { label: 'Obligations', val: completion, color: '#fbbf24' },
                  ].map((g) => {
                    const r = 42
                    const c = 2 * Math.PI * r
                    const off = c - (Math.min(100, Math.max(0, g.val)) / 100) * c
                    return (
                      <div key={g.label} className="flex flex-col items-center">
                        <svg viewBox="0 0 110 110" className="h-28 w-28">
                          <circle cx="55" cy="55" r={r} fill="none" stroke="#1e293b" strokeWidth="10" />
                          <circle
                            cx="55" cy="55" r={r} fill="none" stroke={g.color} strokeWidth="10"
                            strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round"
                            transform="rotate(-90 55 55)"
                          />
                          <text x="55" y="60" textAnchor="middle" fontSize="20" fontWeight="700" fill="#e2e8f0">
                            {g.val.toFixed(0)}%
                          </text>
                        </svg>
                        <span className="mt-1 text-xs text-slate-400">{g.label}</span>
                      </div>
                    )
                  })}
                </div>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-slate-200">Top blocking requirements</h2>
              <p className="mt-0.5 text-xs text-slate-500">Evidence requirements blocking the most systems</p>
            </CardHeader>
            <CardBody>
              {blocking.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No blocking requirements. Nicely done.</p>
              ) : (
                <div className="space-y-3">
                  {blocking.map((b, i) => {
                    const max = Math.max(1, ...blocking.map((x) => num(x.count)))
                    const label = b.title || b.requirement_code || b.code || 'Requirement'
                    return (
                      <div key={i}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="truncate text-slate-200">{label}</span>
                          <span className="ml-3 shrink-0 text-slate-400">{num(b.count)} systems</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                          <div className="h-full rounded-full bg-red-400/70" style={{ width: `${(num(b.count) / max) * 100}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Readiness trend" subtitle="Average registry readiness over time" empty={!(trends?.readiness_trend?.length)}>
              <LineChart points={trends?.readiness_trend ?? []} color="#34d399" suffix="%" />
            </ChartCard>

            <ChartCard title="Classifications per week" subtitle="Classifier runs by week" empty={!(trends?.classifications_per_week?.length)}>
              <BarChart points={trends?.classifications_per_week ?? []} color="#818cf8" />
            </ChartCard>

            <ChartCard title="Obligation burndown" subtitle="Open obligations remaining over time" empty={!(trends?.obligation_burndown?.length)}>
              <LineChart points={trends?.obligation_burndown ?? []} color="#fbbf24" />
            </ChartCard>

            <ChartCard title="Evidence gap trend" subtitle="Outstanding evidence requirements over time" empty={!(trends?.evidence_gap_trend?.length)}>
              <LineChart points={trends?.evidence_gap_trend ?? []} color="#f87171" />
            </ChartCard>
          </div>
        </>
      )}
    </div>
  )
}
