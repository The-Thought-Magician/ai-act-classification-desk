'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, statusTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface RegistryPackage {
  id: string
  system_id: string
  user_id: string
  fields: Record<string, unknown>
  status: string
  readiness_pct: number
  blocking_reasons: string[]
  registered_reference?: string | null
  version: number
  created_at?: string
  updated_at?: string
  system_name?: string
}

function inputCls(extra = '') {
  return `w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 ${extra}`
}

// Canonical EU high-risk registration fields (Art 49 / Annex VIII).
const REGISTRY_FIELDS: { key: string; label: string; multiline?: boolean }[] = [
  { key: 'provider_name', label: 'Provider name' },
  { key: 'provider_contact', label: 'Provider contact' },
  { key: 'system_name', label: 'System trade name' },
  { key: 'intended_purpose', label: 'Intended purpose', multiline: true },
  { key: 'high_risk_category', label: 'Annex III category' },
  { key: 'member_states', label: 'EU member states placed on market' },
  { key: 'conformity_assessment', label: 'Conformity assessment procedure' },
  { key: 'declaration_of_conformity', label: 'Declaration of conformity (URL/ref)' },
  { key: 'ce_marking', label: 'CE marking status' },
  { key: 'instructions_for_use', label: 'Instructions for use (URL/ref)', multiline: true },
]

function blockingList(pkg: RegistryPackage): string[] {
  const r = pkg.blocking_reasons
  return Array.isArray(r) ? r : []
}

export default function RegistryPage() {
  const [packages, setPackages] = useState<RegistryPackage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  const [editing, setEditing] = useState<RegistryPackage | null>(null)
  const [fieldVals, setFieldVals] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const list = await api.listRegistryPackages()
      setPackages(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load registry packages')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const labelFor = useCallback(
    (pkg: RegistryPackage) =>
      pkg.system_name ||
      (typeof pkg.fields?.system_name === 'string' ? (pkg.fields.system_name as string) : '') ||
      pkg.system_id,
    [],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return packages.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false
      if (q && !labelFor(p).toLowerCase().includes(q)) return false
      return true
    })
  }, [packages, statusFilter, search, labelFor])

  const stats = useMemo(() => {
    const byStatus = (s: string) => packages.filter((p) => p.status === s).length
    const avgReadiness = packages.length
      ? Math.round(packages.reduce((a, p) => a + (p.readiness_pct ?? 0), 0) / packages.length)
      : 0
    return {
      total: packages.length,
      draft: byStatus('draft'),
      ready: byStatus('ready'),
      submitted: byStatus('submitted') + byStatus('registered'),
      avgReadiness,
    }
  }, [packages])

  const statuses = useMemo(() => {
    const set = new Set<string>()
    packages.forEach((p) => p.status && set.add(p.status))
    return Array.from(set).sort()
  }, [packages])

  async function openEdit(systemId: string) {
    setError(null)
    try {
      const pkg: RegistryPackage = await api.getRegistryPackage(systemId)
      setEditing(pkg)
      const vals: Record<string, string> = {}
      REGISTRY_FIELDS.forEach((f) => {
        const v = pkg.fields?.[f.key]
        vals[f.key] = v == null ? '' : String(v)
      })
      setFieldVals(vals)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load package')
    }
  }

  async function saveFields() {
    if (!editing) return
    setSaving(true)
    setError(null)
    try {
      const fields: Record<string, string> = {}
      Object.entries(fieldVals).forEach(([k, v]) => {
        if (v.trim()) fields[k] = v.trim()
      })
      const updated: RegistryPackage = await api.updateRegistryPackage(editing.system_id, { fields })
      setPackages((prev) => prev.map((p) => (p.system_id === updated.system_id ? { ...p, ...updated } : p)))
      setEditing(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update package')
    } finally {
      setSaving(false)
    }
  }

  async function submit(pkg: RegistryPackage) {
    setRowBusy(pkg.system_id)
    setError(null)
    try {
      const updated: RegistryPackage = await api.submitRegistryPackage(pkg.system_id)
      setPackages((prev) => prev.map((p) => (p.system_id === updated.system_id ? { ...p, ...updated } : p)))
      if (editing && editing.system_id === pkg.system_id) setEditing(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Submission gate failed')
    } finally {
      setRowBusy(null)
    }
  }

  if (loading) return <PageSpinner label="Loading registry packages..." />

  const editingBlockers = editing ? blockingList(editing) : []
  const editingReady = editing ? (editing.readiness_pct ?? 0) >= 100 && editingBlockers.length === 0 : false

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">EU Registry Packages</h1>
        <p className="mt-1 text-sm text-stone-400">
          Assemble Article 49 high-risk registration packages with a submission-readiness gate.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Packages" value={stats.total} accent="indigo" />
        <Stat label="Draft" value={stats.draft} accent="amber" />
        <Stat label="Ready" value={stats.ready} accent="green" />
        <Stat label="Submitted" value={stats.submitted} accent="green" />
        <Stat label="Avg Readiness" value={`${stats.avgReadiness}%`} accent={stats.avgReadiness === 100 ? 'green' : 'amber'} />
      </div>

      <Card>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            className={inputCls('md:col-span-2')}
            placeholder="Search by system..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={inputCls()} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No registry packages"
          description="Registration packages are created for high-risk systems. Classify a system as high-risk to assemble its EU database registration package."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>System</TH>
              <TH>Readiness</TH>
              <TH>Status</TH>
              <TH>Blocking</TH>
              <TH>Reference</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((p) => {
              const blockers = blockingList(p)
              const pct = Math.round(p.readiness_pct ?? 0)
              return (
                <TR key={p.id}>
                  <TD className="font-medium text-stone-100">{labelFor(p)}</TD>
                  <TD>
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-stone-800">
                        <div
                          className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-stone-400">{pct}%</span>
                    </div>
                  </TD>
                  <TD>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                  </TD>
                  <TD>
                    {blockers.length === 0 ? (
                      <span className="text-xs text-green-400">none</span>
                    ) : (
                      <span className="text-xs text-red-300">{blockers.length} reason{blockers.length > 1 ? 's' : ''}</span>
                    )}
                  </TD>
                  <TD className="font-mono text-xs text-stone-400">{p.registered_reference || '—'}</TD>
                  <TD className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEdit(p.system_id)}>
                        Open
                      </Button>
                      <Button
                        className="px-2 py-1 text-xs"
                        disabled={rowBusy === p.system_id || pct < 100 || blockers.length > 0 || p.status === 'submitted' || p.status === 'registered'}
                        onClick={() => submit(p)}
                      >
                        {rowBusy === p.system_id ? '...' : 'Submit'}
                      </Button>
                    </div>
                  </TD>
                </TR>
              )
            })}
          </TBody>
        </Table>
      )}

      {/* Package editor / readiness drawer */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? `Registration package · ${labelFor(editing)}` : 'Package'}
        className="max-w-3xl"
        footer={
          editing && (
            <>
              <Button variant="ghost" onClick={() => setEditing(null)}>
                Close
              </Button>
              <Button variant="secondary" onClick={saveFields} disabled={saving}>
                {saving ? 'Saving...' : 'Save fields'}
              </Button>
              <Button
                disabled={rowBusy === editing.system_id || !editingReady || editing.status === 'submitted' || editing.status === 'registered'}
                onClick={() => submit(editing)}
              >
                {editing.status === 'submitted' || editing.status === 'registered'
                  ? 'Submitted'
                  : rowBusy === editing.system_id
                    ? 'Submitting...'
                    : 'Submit to registry'}
              </Button>
            </>
          )
        }
      >
        {editing && (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            {/* readiness + gate */}
            <div className="space-y-4 md:order-2">
              <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-stone-500">Readiness</span>
                  <Badge tone={statusTone(editing.status)}>{editing.status}</Badge>
                </div>
                <div className="flex items-center gap-3">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-800">
                    <div
                      className={`h-full rounded-full ${Math.round(editing.readiness_pct ?? 0) === 100 ? 'bg-green-500' : 'bg-amber-500'}`}
                      style={{ width: `${Math.round(editing.readiness_pct ?? 0)}%` }}
                    />
                  </div>
                  <span className="text-lg font-bold text-stone-100">{Math.round(editing.readiness_pct ?? 0)}%</span>
                </div>
                <div className="mt-1 text-xs text-stone-500">version v{editing.version}</div>
              </div>

              <div className="rounded-lg border border-stone-800 bg-stone-950/40 p-4">
                <div className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                  Submission gate
                </div>
                {editingBlockers.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-green-300">
                    <span>✓</span> All checks pass — package is submission-ready.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {editingBlockers.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-red-300">
                        <span className="mt-0.5">✕</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {editing.registered_reference && (
                <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4 text-sm text-green-200">
                  Registered reference:{' '}
                  <span className="font-mono">{editing.registered_reference}</span>
                </div>
              )}
            </div>

            {/* fields */}
            <div className="space-y-3 md:order-1">
              <div className="text-xs font-medium uppercase tracking-wide text-stone-500">
                Annex VIII fields
              </div>
              {REGISTRY_FIELDS.map((f) => (
                <div key={f.key}>
                  <label className="mb-1 block text-xs font-medium text-stone-400">{f.label}</label>
                  {f.multiline ? (
                    <textarea
                      className={inputCls('min-h-[64px]')}
                      value={fieldVals[f.key] ?? ''}
                      onChange={(e) => setFieldVals((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  ) : (
                    <input
                      className={inputCls()}
                      value={fieldVals[f.key] ?? ''}
                      onChange={(e) => setFieldVals((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
