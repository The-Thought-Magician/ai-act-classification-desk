'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, statusTone, tierTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

type Any = Record<string, any>

const STATUSES = ['pending', 'in-progress', 'in-review', 'complete', 'not-applicable']
const TIERS = ['prohibited', 'high', 'limited', 'minimal']

function fmtDate(v?: string) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

function isOverdue(o: Any) {
  if (!o.due_date) return false
  if (['complete', 'not-applicable'].includes(String(o.status))) return false
  return new Date(o.due_date).getTime() < Date.now()
}

const inputCls =
  'rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'

export default function ObligationsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState<Any[]>([])

  const [tier, setTier] = useState('')
  const [status, setStatus] = useState('')
  const [article, setArticle] = useState('')
  const [owner, setOwner] = useState('')
  const [q, setQ] = useState('')

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('complete')
  const [bulkBusy, setBulkBusy] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params: Any = {}
      if (tier) params.tier = tier
      if (status) params.status = status
      if (article) params.article = article
      if (owner) params.owner = owner
      const res = await api.listObligations(params)
      setItems(Array.isArray(res) ? res : [])
      setSelected(new Set())
    } catch (e: any) {
      setError(e?.message || 'Failed to load obligations')
    } finally {
      setLoading(false)
    }
  }, [tier, status, article, owner])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return items
    return items.filter((o) =>
      [o.title, o.description, o.article_ref, o.owner, o.template_code].some((f) => String(f ?? '').toLowerCase().includes(needle)),
    )
  }, [items, q])

  const stats = useMemo(() => {
    const total = items.length
    const complete = items.filter((o) => String(o.status) === 'complete').length
    const overdue = items.filter(isOverdue).length
    const high = items.filter((o) => String(o.tier) === 'high').length
    return { total, complete, overdue, high, pctDone: total ? Math.round((complete / total) * 100) : 0 }
  }, [items])

  const allVisibleSelected = filtered.length > 0 && filtered.every((o) => selected.has(o.id))
  const toggleAll = () => {
    if (allVisibleSelected) setSelected(new Set())
    else setSelected(new Set(filtered.map((o) => o.id)))
  }
  const toggleOne = (id: string) => {
    setSelected((s) => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Inline single-field update with optimistic UI.
  const patchRow = async (id: string, body: Any) => {
    setRowBusy(id)
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...body } : o)))
    try {
      const updated = await api.updateObligation(id, body)
      setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...updated } : o)))
    } catch (e: any) {
      setError(e?.message || 'Update failed')
      load()
    } finally {
      setRowBusy(null)
    }
  }

  const runBulk = async () => {
    if (selected.size === 0) return
    setBulkBusy(true)
    setError(null)
    try {
      await api.bulkUpdateObligations({ ids: Array.from(selected), status: bulkStatus })
      await load()
    } catch (e: any) {
      setError(e?.message || 'Bulk update failed')
    } finally {
      setBulkBusy(false)
    }
  }

  const resetFilters = () => {
    setTier(''); setStatus(''); setArticle(''); setOwner(''); setQ('')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Obligations registry</h1>
        <p className="mt-1 text-sm text-slate-400">Track every EU AI Act obligation across your portfolio. Update status inline or in bulk.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total" value={stats.total} accent="indigo" />
        <Stat label="Completion" value={`${stats.pctDone}%`} accent={stats.pctDone === 100 ? 'green' : 'amber'} hint={`${stats.complete} complete`} />
        <Stat label="Overdue" value={stats.overdue} accent={stats.overdue ? 'red' : 'green'} />
        <Stat label="High-risk" value={stats.high} accent="amber" />
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Search</span>
            <input className={`${inputCls} w-56`} placeholder="title, article, owner..." value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Tier</span>
            <select className={inputCls} value={tier} onChange={(e) => setTier(e.target.value)}>
              <option value="">All tiers</option>
              {TIERS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Status</span>
            <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Article</span>
            <input className={`${inputCls} w-32`} placeholder="Art. 9" value={article} onChange={(e) => setArticle(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-slate-500">Owner</span>
            <input className={`${inputCls} w-40`} placeholder="owner" value={owner} onChange={(e) => setOwner(e.target.value)} />
          </label>
          <Button variant="ghost" onClick={resetFilters}>Reset</Button>
        </CardBody>
      </Card>

      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
          <span className="text-sm text-indigo-200">{selected.size} selected</span>
          <span className="text-slate-600">·</span>
          <span className="text-sm text-slate-300">Set status to</span>
          <select className={inputCls} value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <Button onClick={runBulk} disabled={bulkBusy}>{bulkBusy ? 'Applying...' : 'Apply'}</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          <span>{error}</span>
          <button onClick={load} className="text-red-200 underline">Retry</button>
        </div>
      )}

      {loading ? (
        <PageSpinner label="Loading obligations..." />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={items.length === 0 ? 'No obligations yet' : 'No matches'}
          description={items.length === 0 ? 'Obligations are generated when you classify a system.' : 'Try adjusting the filters above.'}
          action={items.length === 0 ? <Link href="/dashboard/systems"><Button>Go to systems</Button></Link> : <Button variant="secondary" onClick={resetFilters}>Reset filters</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH className="w-10">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={allVisibleSelected} onChange={toggleAll} />
              </TH>
              <TH>Obligation</TH>
              <TH>Tier</TH>
              <TH>Article</TH>
              <TH>Owner</TH>
              <TH>Due</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((o) => (
              <TR key={o.id} className={selected.has(o.id) ? 'bg-indigo-500/5' : ''}>
                <TD>
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-indigo-500 focus:ring-indigo-500" checked={selected.has(o.id)} onChange={() => toggleOne(o.id)} />
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    {o.system_id && (
                      <Link href={`/dashboard/systems/${o.system_id}`} className="font-medium text-slate-100 hover:text-indigo-300">{o.title}</Link>
                    )}
                    {!o.system_id && <span className="font-medium text-slate-100">{o.title}</span>}
                  </div>
                  {o.applicability_reason && <div className="text-xs text-slate-500">{o.applicability_reason}</div>}
                </TD>
                <TD><Badge tone={tierTone(o.tier)}>{o.tier || '—'}</Badge></TD>
                <TD className="text-xs text-slate-400">{o.article_ref || '—'}</TD>
                <TD>
                  <input
                    className={`${inputCls} w-32 py-1`}
                    defaultValue={o.owner || ''}
                    placeholder="owner"
                    onBlur={(e) => { if (e.target.value !== (o.owner || '')) patchRow(o.id, { owner: e.target.value }) }}
                  />
                </TD>
                <TD>
                  <input
                    type="date"
                    className={`${inputCls} py-1 ${isOverdue(o) ? 'border-red-500/50 text-red-300' : ''}`}
                    defaultValue={o.due_date ? String(o.due_date).slice(0, 10) : ''}
                    onChange={(e) => patchRow(o.id, { due_date: e.target.value || null })}
                  />
                  {isOverdue(o) && <div className="mt-0.5 text-xs text-red-400">overdue · {fmtDate(o.due_date)}</div>}
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <Badge tone={statusTone(o.status)}>{o.status}</Badge>
                    <select
                      className={`${inputCls} py-1`}
                      value={o.status}
                      disabled={rowBusy === o.id}
                      onChange={(e) => patchRow(o.id, { status: e.target.value })}
                    >
                      {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  )
}
