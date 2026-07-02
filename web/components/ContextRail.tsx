'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Badge, tierTone } from '@/components/ui/Badge'

// Persistent right-rail widget for high-traffic pages. Pulls live portfolio
// data from the existing GET /dashboard/summary endpoint — no mock data, no
// new backend routes.

interface RecentClassification {
  id?: string
  system_id?: string
  system_name?: string
  tier?: string
  created_at?: string
}

interface RailSummary {
  systems_total?: number
  obligations?: { completion_pct?: number }
  evidence?: { gaps?: number }
  recent_classifications?: RecentClassification[]
  upcoming_deadlines?: { id?: string; label?: string; due_date?: string }[]
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const TIER_LABEL: Record<string, string> = {
  prohibited: 'Prohibited',
  high: 'High Risk',
  limited: 'Limited Risk',
  minimal: 'Minimal Risk',
}

export default function ContextRail() {
  const [summary, setSummary] = useState<RailSummary | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let active = true
    api
      .getDashboardSummary()
      .then((s: unknown) => {
        if (active) setSummary(s as RailSummary)
      })
      .catch(() => {
        if (active) setError(true)
      })
    return () => {
      active = false
    }
  }, [])

  const recent = summary?.recent_classifications?.slice(0, 5) ?? []
  const deadlines = summary?.upcoming_deadlines?.slice(0, 4) ?? []

  return (
    <aside className="hidden w-72 shrink-0 space-y-4 xl:block">
      <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Audit Snapshot</div>
        {error ? (
          <p className="mt-2 text-xs text-stone-500">Snapshot unavailable.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xl font-bold text-rose-300">{summary?.systems_total ?? '—'}</div>
              <div className="text-[11px] text-stone-500">AI systems</div>
            </div>
            <div>
              <div className="text-xl font-bold text-rose-300">
                {summary?.obligations?.completion_pct != null ? `${summary.obligations.completion_pct}%` : '—'}
              </div>
              <div className="text-[11px] text-stone-500">Obligations done</div>
            </div>
            <div className="col-span-2">
              <div className="text-xl font-bold text-rose-300">{summary?.evidence?.gaps ?? '—'}</div>
              <div className="text-[11px] text-stone-500">Evidence gaps open</div>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Recent Classifications</div>
        <div className="mt-3 space-y-2">
          {recent.length === 0 && <p className="text-xs text-stone-500">No classification events yet.</p>}
          {recent.map((c, i) => (
            <Link
              key={c.id || `${c.system_id}-${i}`}
              href={c.system_id ? `/dashboard/systems/${c.system_id}` : '/dashboard/systems'}
              className="flex items-center justify-between gap-2 rounded-lg border border-stone-800/80 bg-stone-950/40 px-2.5 py-2 hover:border-rose-500/40"
            >
              <div className="min-w-0">
                <div className="truncate text-xs text-stone-200">{c.system_name || 'System'}</div>
                <div className="text-[10px] text-stone-500">{fmtDate(c.created_at)}</div>
              </div>
              <Badge tone={tierTone(c.tier)}>{c.tier ? TIER_LABEL[c.tier] || c.tier : '—'}</Badge>
            </Link>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Next Deadlines</div>
        <div className="mt-3 space-y-2">
          {deadlines.length === 0 && <p className="text-xs text-stone-500">Nothing due in the next 30 days.</p>}
          {deadlines.map((d, i) => (
            <div key={d.id || i} className="rounded-lg border border-stone-800/80 bg-stone-950/40 px-2.5 py-2">
              <div className="truncate text-xs text-stone-200">{d.label || 'Deadline'}</div>
              <div className="text-[10px] text-stone-500">{fmtDate(d.due_date)}</div>
            </div>
          ))}
        </div>
        <Link href="/dashboard/deadlines" className="mt-3 block text-[11px] font-medium text-rose-400 hover:text-rose-300">
          View all deadlines →
        </Link>
      </div>
    </aside>
  )
}
