'use client'

import { useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, tierTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface AiSystem {
  id: string
  name: string
  role: string
  current_tier?: string | null
  status?: string
}

interface RoleEvent {
  id: string
  system_id: string
  event_type: string
  description: string
  before_role: string
  after_role: string
  flipped: boolean
  created_by?: string
  created_at: string
}

const ROLES = ['provider', 'deployer', 'importer', 'distributor', 'product_manufacturer']
const EVENT_TYPES = [
  { code: 'substantial_modification', label: 'Substantial modification' },
  { code: 'rebrand', label: 'Rebrand / re-label' },
  { code: 'purpose_change', label: 'Intended purpose change' },
  { code: 'finetune', label: 'Fine-tune / re-train' },
]

function fmtRole(r?: string) {
  if (!r) return '—'
  return r.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

function fmtEventType(t: string) {
  return EVENT_TYPES.find((e) => e.code === t)?.label ?? fmtRole(t)
}

function fmtDate(s?: string) {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

export default function RolesPage() {
  const [events, setEvents] = useState<RoleEvent[]>([])
  const [systems, setSystems] = useState<AiSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState('')
  const [systemFilter, setSystemFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [flippedOnly, setFlippedOnly] = useState(false)

  const [modalOpen, setModalOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [form, setForm] = useState({
    system_id: '',
    event_type: 'substantial_modification',
    description: '',
    after_role: 'provider',
  })

  async function load() {
    setError(null)
    try {
      const [ev, sys] = await Promise.all([api.listRoleEvents(), api.listSystems()])
      setEvents(Array.isArray(ev) ? ev : [])
      setSystems(Array.isArray(sys) ? sys : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load role events')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const systemById = useMemo(() => {
    const m = new Map<string, AiSystem>()
    for (const s of systems) m.set(s.id, s)
    return m
  }, [systems])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return events.filter((e) => {
      if (systemFilter && e.system_id !== systemFilter) return false
      if (typeFilter && e.event_type !== typeFilter) return false
      if (flippedOnly && !e.flipped) return false
      if (q) {
        const name = systemById.get(e.system_id)?.name ?? ''
        const hay = `${e.description} ${e.event_type} ${e.before_role} ${e.after_role} ${name}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [events, search, systemFilter, typeFilter, flippedOnly, systemById])

  const flips = useMemo(() => events.filter((e) => e.flipped).length, [events])
  const systemsTouched = useMemo(() => new Set(events.map((e) => e.system_id)).size, [events])

  function openModal() {
    setFormErr(null)
    setForm({
      system_id: systems[0]?.id ?? '',
      event_type: 'substantial_modification',
      description: '',
      after_role: systems[0]?.role ?? 'provider',
    })
    setModalOpen(true)
  }

  function onPickSystem(id: string) {
    const s = systemById.get(id)
    setForm((f) => ({ ...f, system_id: id, after_role: s?.role ?? f.after_role }))
  }

  async function submit() {
    if (!form.system_id) {
      setFormErr('Select a system.')
      return
    }
    setSubmitting(true)
    setFormErr(null)
    try {
      await api.createRoleEvent(form.system_id, {
        event_type: form.event_type,
        description: form.description,
        after_role: form.after_role,
      })
      setModalOpen(false)
      setLoading(true)
      await load()
    } catch (e) {
      setFormErr(e instanceof Error ? e.message : 'Failed to record role event')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return <PageSpinner label="Loading role-change log..." />

  const selectedSystem = systemById.get(form.system_id)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Role Changes</h1>
          <p className="mt-1 text-sm text-slate-400">
            Track substantial modifications, rebrands, and purpose changes that may flip your
            operator role and re-trigger obligations under the EU AI Act.
          </p>
        </div>
        <Button onClick={openModal} disabled={systems.length === 0}>
          + Record modification
        </Button>
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
        <Stat label="Total events" value={events.length} accent="indigo" />
        <Stat label="Role flips" value={flips} accent="amber" hint="Events that changed effective role" />
        <Stat label="Systems affected" value={systemsTouched} accent="slate" />
        <Stat label="Registered systems" value={systems.length} accent="green" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Role-change log</h2>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search events..."
                className="w-44 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
              <select
                value={systemFilter}
                onChange={(e) => setSystemFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All systems</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
              >
                <option value="">All types</option>
                {EVENT_TYPES.map((t) => (
                  <option key={t.code} value={t.code}>{t.label}</option>
                ))}
              </select>
              <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-1.5 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={flippedOnly}
                  onChange={(e) => setFlippedOnly(e.target.checked)}
                  className="accent-amber-500"
                />
                Flips only
              </label>
            </div>
          </div>
        </CardHeader>
        <CardBody className="p-0">
          {filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={events.length === 0 ? 'No role events yet' : 'No events match your filters'}
                description={
                  events.length === 0
                    ? 'Record a substantial modification to begin tracking role changes.'
                    : 'Adjust the search or filters above.'
                }
                icon="⇄"
                action={
                  events.length === 0 ? (
                    <Button onClick={openModal} disabled={systems.length === 0}>Record modification</Button>
                  ) : undefined
                }
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>System</TH>
                  <TH>Event</TH>
                  <TH>Role change</TH>
                  <TH>Description</TH>
                  <TH>When</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((e) => {
                  const sys = systemById.get(e.system_id)
                  return (
                    <TR key={e.id}>
                      <TD>
                        <div className="font-medium text-slate-100">{sys?.name ?? 'Unknown system'}</div>
                        {sys?.current_tier && (
                          <Badge tone={tierTone(sys.current_tier)} className="mt-1">{sys.current_tier}</Badge>
                        )}
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <span className="text-slate-200">{fmtEventType(e.event_type)}</span>
                          {e.flipped && <Badge tone="amber">Role flipped</Badge>}
                        </div>
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2 text-sm">
                          <Badge tone="slate">{fmtRole(e.before_role)}</Badge>
                          <span className="text-slate-500">→</span>
                          <Badge tone={e.flipped ? 'amber' : 'indigo'}>{fmtRole(e.after_role)}</Badge>
                        </div>
                      </TD>
                      <TD className="max-w-xs">
                        <span className="text-slate-400">{e.description || '—'}</span>
                      </TD>
                      <TD className="whitespace-nowrap text-slate-400">{fmtDate(e.created_at)}</TD>
                    </TR>
                  )
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record substantial modification"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={submitting}>Cancel</Button>
            <Button onClick={submit} disabled={submitting}>{submitting ? 'Recording...' : 'Record event'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          {formErr && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">{formErr}</div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">System</label>
            <select
              value={form.system_id}
              onChange={(e) => onPickSystem(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {systems.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {selectedSystem && (
              <p className="mt-1 text-xs text-slate-500">
                Current role: <span className="text-slate-300">{fmtRole(selectedSystem.role)}</span>
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Event type</label>
            <select
              value={form.event_type}
              onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {EVENT_TYPES.map((t) => (
                <option key={t.code} value={t.code}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">New effective role</label>
            <select
              value={form.after_role}
              onChange={(e) => setForm((f) => ({ ...f, after_role: e.target.value }))}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 focus:border-indigo-500 focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{fmtRole(r)}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Under Art. 25, a substantial modification can make a deployer assume provider obligations.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              rows={3}
              placeholder="What changed and why this may affect the system's role or risk tier..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
