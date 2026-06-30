'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface AuditEntry {
  id: string
  user_id: string
  action: string
  entity_type: string
  entity_id: string | null
  summary: string | null
  meta: unknown
  created_at: string
}

function fmt(ts?: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function dateKey(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return 'Unknown'
  return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })
}

function actionTone(action: string): 'green' | 'amber' | 'red' | 'indigo' | 'blue' | 'slate' {
  const a = action.toLowerCase()
  if (a.includes('create') || a.includes('publish') || a.includes('submit')) return 'green'
  if (a.includes('delete') || a.includes('revoke') || a.includes('override') || a.includes('flip')) return 'red'
  if (a.includes('update') || a.includes('edit') || a.includes('regenerate')) return 'amber'
  if (a.includes('classif') || a.includes('run')) return 'indigo'
  return 'slate'
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // server-side filters
  const [action, setAction] = useState('')
  const [entityType, setEntityType] = useState('')
  const [date, setDate] = useState('')

  // client-side text search
  const [search, setSearch] = useState('')
  const [detail, setDetail] = useState<AuditEntry | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Record<string, string> = {}
      if (action) params.action = action
      if (entityType) params.entity_type = entityType
      if (date) params.date = date
      const data = await api.getAuditLog(Object.keys(params).length ? params : undefined)
      setEntries(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load audit log')
    } finally {
      setLoading(false)
    }
  }, [action, entityType, date])

  useEffect(() => {
    load()
  }, [load])

  // Distinct values populate the filter dropdowns (derived from loaded rows).
  const actionOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.action).filter(Boolean))).sort(),
    [entries],
  )
  const entityOptions = useMemo(
    () => Array.from(new Set(entries.map((e) => e.entity_type).filter(Boolean))).sort(),
    [entries],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return entries
    return entries.filter(
      (e) =>
        e.action.toLowerCase().includes(q) ||
        e.entity_type.toLowerCase().includes(q) ||
        (e.summary || '').toLowerCase().includes(q) ||
        (e.entity_id || '').toLowerCase().includes(q),
    )
  }, [entries, search])

  // Group filtered rows by calendar day for a timeline view.
  const grouped = useMemo(() => {
    const map = new Map<string, AuditEntry[]>()
    for (const e of filtered) {
      const k = dateKey(e.created_at)
      const arr = map.get(k)
      if (arr) arr.push(e)
      else map.set(k, [e])
    }
    return Array.from(map.entries())
  }, [filtered])

  // Tiny activity sparkline: counts per day (most recent 14 days present in data).
  const spark = useMemo(() => {
    const byDay = new Map<string, number>()
    for (const e of entries) {
      const d = new Date(e.created_at)
      if (isNaN(d.getTime())) continue
      const k = d.toISOString().slice(0, 10)
      byDay.set(k, (byDay.get(k) || 0) + 1)
    }
    const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).slice(-14)
    const max = Math.max(1, ...days.map((d) => d[1]))
    return { days, max }
  }, [entries])

  const hasFilters = action || entityType || date || search

  function clearFilters() {
    setAction('')
    setEntityType('')
    setDate('')
    setSearch('')
  }

  if (loading && entries.length === 0) return <PageSpinner label="Loading audit log…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-400">
          Immutable record of every action across your AI systems, classifications, and compliance artifacts.
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Events shown" value={filtered.length} accent="indigo" />
        <Stat label="Action types" value={actionOptions.length} accent="amber" />
        <Stat label="Entity types" value={entityOptions.length} accent="green" />
        <Stat
          label="Latest"
          value={<span className="text-base">{entries[0] ? fmt(entries[0].created_at).split(',')[0] : '—'}</span>}
        />
      </div>

      {spark.days.length > 1 && (
        <Card>
          <CardBody>
            <div className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Activity (last {spark.days.length} active days)</div>
            <div className="flex items-end gap-1" style={{ height: 64 }}>
              {spark.days.map(([day, count]) => (
                <div key={day} className="group flex flex-1 flex-col items-center justify-end" title={`${day}: ${count}`}>
                  <div
                    className="w-full rounded-t bg-indigo-500/70 transition-colors group-hover:bg-amber-400"
                    style={{ height: `${(count / spark.max) * 100}%`, minHeight: 2 }}
                  />
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[160px] flex-1">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Search</label>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by summary, entity, id…"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All actions</option>
                {actionOptions.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Entity</label>
              <select
                value={entityType}
                onChange={(e) => setEntityType(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All entities</option>
                {entityOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          {loading ? (
            <PageSpinner label="Filtering…" />
          ) : filtered.length === 0 ? (
            <EmptyState
              title={hasFilters ? 'No matching events' : 'No audit events yet'}
              description={
                hasFilters
                  ? 'Adjust or clear the filters to see more activity.'
                  : 'As you create systems, run classifications, and update obligations, every action is recorded here.'
              }
              action={hasFilters ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : undefined}
            />
          ) : (
            <div className="space-y-6">
              {grouped.map(([day, rows]) => (
                <div key={day}>
                  <div className="mb-2 flex items-center gap-3">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{day}</span>
                    <span className="h-px flex-1 bg-slate-800" />
                    <Badge tone="slate">{rows.length}</Badge>
                  </div>
                  <Table>
                    <THead>
                      <TR>
                        <TH className="w-40">Time</TH>
                        <TH>Action</TH>
                        <TH>Entity</TH>
                        <TH>Summary</TH>
                        <TH className="text-right">Details</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {rows.map((e) => (
                        <TR key={e.id}>
                          <TD className="whitespace-nowrap text-xs text-slate-400">
                            {new Date(e.created_at).toLocaleTimeString()}
                          </TD>
                          <TD>
                            <Badge tone={actionTone(e.action)}>{e.action}</Badge>
                          </TD>
                          <TD>
                            <div className="text-xs">
                              <span className="text-slate-200">{e.entity_type}</span>
                              {e.entity_id && (
                                <span className="ml-1 font-mono text-[10px] text-slate-500">
                                  {e.entity_id.slice(0, 8)}
                                </span>
                              )}
                            </div>
                          </TD>
                          <TD className="max-w-[360px]">
                            <span className="block truncate text-slate-300" title={e.summary || ''}>
                              {e.summary || '—'}
                            </span>
                          </TD>
                          <TD className="text-right">
                            <Button
                              variant="ghost"
                              onClick={() => setDetail(e)}
                              disabled={e.meta == null}
                            >
                              View
                            </Button>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <Modal
        open={!!detail}
        onClose={() => setDetail(null)}
        title="Audit entry"
        footer={<Button onClick={() => setDetail(null)}>Close</Button>}
      >
        {detail && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Action" value={<Badge tone={actionTone(detail.action)}>{detail.action}</Badge>} />
              <Field label="Entity type" value={detail.entity_type} />
              <Field label="Entity id" value={<span className="font-mono text-xs">{detail.entity_id || '—'}</span>} />
              <Field label="When" value={<span className="text-xs">{fmt(detail.created_at)}</span>} />
            </div>
            {detail.summary && (
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Summary</div>
                <p className="mt-1 text-slate-200">{detail.summary}</p>
              </div>
            )}
            <div>
              <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Metadata</div>
              <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                {detail.meta == null ? 'null' : JSON.stringify(detail.meta, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-slate-200">{value}</div>
    </div>
  )
}
