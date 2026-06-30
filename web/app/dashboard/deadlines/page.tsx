'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, statusTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Deadline {
  id: string
  system_id?: string | null
  user_id?: string
  label: string
  due_date: string
  source: string // custom | obligation | registry
  status: string
  created_at?: string
}

interface DeadlineBuckets {
  overdue: Deadline[]
  due_soon: Deadline[]
  upcoming: Deadline[]
}

type BucketKey = 'overdue' | 'due_soon' | 'upcoming'

const BUCKET_META: Record<BucketKey, { title: string; tone: 'red' | 'amber' | 'indigo'; accent: 'red' | 'amber' | 'indigo'; desc: string }> = {
  overdue: { title: 'Overdue', tone: 'red', accent: 'red', desc: 'Past their due date' },
  due_soon: { title: 'Due soon', tone: 'amber', accent: 'amber', desc: 'Within the next 30 days' },
  upcoming: { title: 'Upcoming', tone: 'indigo', accent: 'indigo', desc: 'Further out' },
}

const SOURCE_TONE: Record<string, 'indigo' | 'amber' | 'blue'> = {
  custom: 'indigo',
  obligation: 'amber',
  registry: 'blue',
}

function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function daysUntil(due: string) {
  const d = startOfDay(new Date(due))
  const today = startOfDay(new Date())
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

function fmtDate(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' })
}

function relativeLabel(due: string) {
  const n = daysUntil(due)
  if (n < 0) return `${Math.abs(n)}d overdue`
  if (n === 0) return 'Due today'
  if (n === 1) return 'Due tomorrow'
  return `in ${n}d`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

export default function DeadlinesPage() {
  const [data, setData] = useState<DeadlineBuckets>({ overdue: [], due_soon: [], upcoming: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [form, setForm] = useState({ label: '', due_date: '' })
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function load() {
    setError(null)
    try {
      const res = await api.getDeadlines()
      setData({
        overdue: Array.isArray(res?.overdue) ? res.overdue : [],
        due_soon: Array.isArray(res?.due_soon) ? res.due_soon : [],
        upcoming: Array.isArray(res?.upcoming) ? res.upcoming : [],
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deadlines')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const all = useMemo(() => [...data.overdue, ...data.due_soon, ...data.upcoming], [data])

  function openModal() {
    setFormErr(null)
    setForm({ label: '', due_date: '' })
    setModalOpen(true)
  }

  async function submit() {
    if (!form.label.trim()) {
      setFormErr('Enter a label.')
      return
    }
    if (!form.due_date) {
      setFormErr('Pick a due date.')
      return
    }
    setSubmitting(true)
    setFormErr(null)
    try {
      await api.createDeadline({
        label: form.label.trim(),
        due_date: new Date(form.due_date).toISOString(),
        source: 'custom',
      })
      setModalOpen(false)
      setLoading(true)
      await load()
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Failed to create deadline')
    } finally {
      setSubmitting(false)
    }
  }

  async function remove(id: string) {
    setDeletingId(id)
    try {
      await api.deleteDeadline(id)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete deadline')
    } finally {
      setDeletingId(null)
    }
  }

  // Calendar grid for current month, leading from Monday
  const calCells = useMemo(() => {
    const year = calMonth.getFullYear()
    const month = calMonth.getMonth()
    const first = new Date(year, month, 1)
    const startWeekday = (first.getDay() + 6) % 7 // Mon=0
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const byDay = new Map<string, Deadline[]>()
    for (const d of all) {
      const dt = new Date(d.due_date)
      if (dt.getFullYear() === year && dt.getMonth() === month) {
        const key = String(dt.getDate())
        const arr = byDay.get(key) ?? []
        arr.push(d)
        byDay.set(key, arr)
      }
    }
    const cells: Array<{ day: number | null; items: Deadline[] }> = []
    for (let i = 0; i < startWeekday; i++) cells.push({ day: null, items: [] })
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ day, items: byDay.get(String(day)) ?? [] })
    }
    while (cells.length % 7 !== 0) cells.push({ day: null, items: [] })
    return cells
  }, [calMonth, all])

  const todayNum = useMemo(() => {
    const t = new Date()
    return t.getFullYear() === calMonth.getFullYear() && t.getMonth() === calMonth.getMonth()
      ? t.getDate()
      : -1
  }, [calMonth])

  if (loading) return <PageSpinner label="Loading deadlines..." />

  function renderBucket(key: BucketKey) {
    const meta = BUCKET_META[key]
    const items = [...data[key]].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime(),
    )
    return (
      <Card key={key}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-200">{meta.title}</h2>
              <Badge tone={meta.tone}>{items.length}</Badge>
            </div>
            <span className="text-xs text-slate-500">{meta.desc}</span>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {items.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-slate-500">Nothing here.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {items.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-slate-100">{d.label}</span>
                      <Badge tone={SOURCE_TONE[d.source] ?? 'slate'}>{d.source}</Badge>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                      <span>{fmtDate(d.due_date)}</span>
                      <span className={key === 'overdue' ? 'text-red-300' : key === 'due_soon' ? 'text-amber-300' : 'text-slate-500'}>
                        · {relativeLabel(d.due_date)}
                      </span>
                      {d.status && <Badge tone={statusTone(d.status)}>{d.status}</Badge>}
                    </div>
                  </div>
                  {d.source === 'custom' ? (
                    <Button
                      variant="ghost"
                      onClick={() => remove(d.id)}
                      disabled={deletingId === d.id}
                      className="shrink-0"
                    >
                      {deletingId === d.id ? '…' : 'Delete'}
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-slate-600">auto</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Deadlines</h1>
          <p className="mt-1 text-sm text-slate-400">
            Compliance milestones aggregated from obligations, registry submissions, and your own
            custom deadlines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-700 bg-slate-950/60 p-0.5">
            <button
              onClick={() => setView('list')}
              className={`rounded-md px-3 py-1.5 text-sm ${view === 'list' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              List
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`rounded-md px-3 py-1.5 text-sm ${view === 'calendar' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              Calendar
            </button>
          </div>
          <Button onClick={openModal}>+ Custom deadline</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
          <button onClick={() => { setLoading(true); load() }} className="ml-3 underline hover:text-red-200">
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Overdue" value={data.overdue.length} accent="red" />
        <Stat label="Due soon" value={data.due_soon.length} accent="amber" hint="Next 30 days" />
        <Stat label="Upcoming" value={data.upcoming.length} accent="indigo" />
        <Stat label="Total tracked" value={all.length} accent="slate" />
      </div>

      {all.length === 0 ? (
        <EmptyState
          title="No deadlines yet"
          description="Deadlines appear automatically from obligations and registry submissions. You can also add custom milestones."
          icon="🗓"
          action={<Button onClick={openModal}>Add custom deadline</Button>}
        />
      ) : view === 'list' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {(['overdue', 'due_soon', 'upcoming'] as BucketKey[]).map(renderBucket)}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-200">
                {MONTHS[calMonth.getMonth()]} {calMonth.getFullYear()}
              </h2>
              <div className="flex items-center gap-2">
                <Button variant="secondary" onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</Button>
                <Button
                  variant="ghost"
                  onClick={() => { const d = new Date(); setCalMonth(new Date(d.getFullYear(), d.getMonth(), 1)) }}
                >
                  Today
                </Button>
                <Button variant="secondary" onClick={() => setCalMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</Button>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-slate-800 bg-slate-800">
              {WEEKDAYS.map((w) => (
                <div key={w} className="bg-slate-900/80 py-2 text-center text-xs font-semibold uppercase text-slate-500">{w}</div>
              ))}
              {calCells.map((cell, i) => (
                <div
                  key={i}
                  className={`min-h-[88px] bg-slate-950/40 p-1.5 ${cell.day === null ? 'opacity-40' : ''}`}
                >
                  {cell.day !== null && (
                    <>
                      <div className={`mb-1 text-right text-xs ${cell.day === todayNum ? 'font-bold text-indigo-300' : 'text-slate-500'}`}>
                        {cell.day}
                      </div>
                      <div className="space-y-1">
                        {cell.items.slice(0, 3).map((d) => {
                          const n = daysUntil(d.due_date)
                          const tone = n < 0 ? 'bg-red-500/20 text-red-300' : n <= 30 ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/20 text-indigo-300'
                          return (
                            <div key={d.id} className={`truncate rounded px-1.5 py-0.5 text-[11px] ${tone}`} title={`${d.label} (${d.source})`}>
                              {d.label}
                            </div>
                          )
                        })}
                        {cell.items.length > 3 && (
                          <div className="px-1.5 text-[11px] text-slate-500">+{cell.items.length - 3} more</div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-red-500/60" /> Overdue</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-amber-500/60" /> Due soon</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded bg-indigo-500/60" /> Upcoming</span>
            </div>
          </CardBody>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add custom deadline"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? 'Saving...' : 'Add deadline'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formErr && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formErr}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Label</label>
            <input
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Internal high-risk review board"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Due date</label>
            <input
              type="date"
              value={form.due_date}
              onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
