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

interface EvidenceRequirement {
  id: string
  system_id: string
  user_id: string
  requirement_code: string
  category: string
  title: string
  description?: string
  required: boolean
  status: string
  artifact_url?: string | null
  artifact_meta?: Record<string, unknown> | null
  reviewer?: string | null
  notes?: string | null
  created_at?: string
  updated_at?: string
}

interface EvidenceArtifact {
  id: string
  user_id: string
  name: string
  url: string
  meta?: Record<string, unknown> | null
  created_at?: string
}

const STATUS_OPTIONS = [
  'missing',
  'in-progress',
  'in-review',
  'approved',
  'not-applicable',
]

function inputCls(extra = '') {
  return `w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 ${extra}`
}

export default function EvidencePage() {
  const [requirements, setRequirements] = useState<EvidenceRequirement[]>([])
  const [artifacts, setArtifacts] = useState<EvidenceArtifact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // filters
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [reviewerFilter, setReviewerFilter] = useState('')

  // editing requirement
  const [editing, setEditing] = useState<EvidenceRequirement | null>(null)
  const [editStatus, setEditStatus] = useState('')
  const [editArtifactUrl, setEditArtifactUrl] = useState('')
  const [editReviewer, setEditReviewer] = useState('')
  const [editNotes, setEditNotes] = useState('')
  const [savingReq, setSavingReq] = useState(false)

  // new artifact
  const [showArtifactForm, setShowArtifactForm] = useState(false)
  const [artifactName, setArtifactName] = useState('')
  const [artifactUrl, setArtifactUrl] = useState('')
  const [artifactNote, setArtifactNote] = useState('')
  const [savingArtifact, setSavingArtifact] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reqs, arts] = await Promise.all([api.listEvidence(), api.listArtifacts()])
      setRequirements(Array.isArray(reqs) ? reqs : [])
      setArtifacts(Array.isArray(arts) ? arts : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load evidence registry')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const categories = useMemo(() => {
    const set = new Set<string>()
    requirements.forEach((r) => r.category && set.add(r.category))
    return Array.from(set).sort()
  }, [requirements])

  const reviewers = useMemo(() => {
    const set = new Set<string>()
    requirements.forEach((r) => r.reviewer && set.add(r.reviewer))
    return Array.from(set).sort()
  }, [requirements])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requirements.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false
      if (categoryFilter && r.category !== categoryFilter) return false
      if (reviewerFilter && r.reviewer !== reviewerFilter) return false
      if (q) {
        const hay = `${r.title} ${r.requirement_code} ${r.category} ${r.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [requirements, search, statusFilter, categoryFilter, reviewerFilter])

  const stats = useMemo(() => {
    const required = requirements.filter((r) => r.required)
    const approvedRequired = required.filter((r) => r.status === 'approved')
    const readiness = required.length ? Math.round((approvedRequired.length / required.length) * 100) : 0
    const gaps = required.filter((r) => r.status === 'missing' || r.status === 'in-progress').length
    return {
      total: requirements.length,
      required: required.length,
      readiness,
      gaps,
      approved: requirements.filter((r) => r.status === 'approved').length,
    }
  }, [requirements])

  // group requirements by category for the readiness breakdown chart
  const categoryReadiness = useMemo(() => {
    const map = new Map<string, { total: number; approved: number }>()
    requirements.forEach((r) => {
      const c = r.category || 'uncategorized'
      const cur = map.get(c) ?? { total: 0, approved: 0 }
      cur.total += 1
      if (r.status === 'approved') cur.approved += 1
      map.set(c, cur)
    })
    return Array.from(map.entries())
      .map(([category, v]) => ({
        category,
        total: v.total,
        approved: v.approved,
        pct: v.total ? Math.round((v.approved / v.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [requirements])

  function openEdit(r: EvidenceRequirement) {
    setEditing(r)
    setEditStatus(r.status)
    setEditArtifactUrl(r.artifact_url ?? '')
    setEditReviewer(r.reviewer ?? '')
    setEditNotes(r.notes ?? '')
  }

  async function saveRequirement() {
    if (!editing) return
    setSavingReq(true)
    setError(null)
    try {
      const updated = await api.updateEvidenceRequirement(editing.id, {
        status: editStatus,
        artifact_url: editArtifactUrl || null,
        reviewer: editReviewer || null,
        notes: editNotes || null,
      })
      setRequirements((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update requirement')
    } finally {
      setSavingReq(false)
    }
  }

  async function quickStatus(r: EvidenceRequirement, status: string) {
    setRowBusy(r.id)
    setError(null)
    try {
      const updated = await api.updateEvidenceRequirement(r.id, { status })
      setRequirements((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update status')
    } finally {
      setRowBusy(null)
    }
  }

  async function attachArtifact(r: EvidenceRequirement, url: string) {
    setRowBusy(r.id)
    setError(null)
    try {
      const updated = await api.updateEvidenceRequirement(r.id, {
        artifact_url: url,
        status: r.status === 'missing' ? 'in-review' : r.status,
      })
      setRequirements((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to attach artifact')
    } finally {
      setRowBusy(null)
    }
  }

  async function createArtifact() {
    if (!artifactName.trim() || !artifactUrl.trim()) return
    setSavingArtifact(true)
    setError(null)
    try {
      const created = await api.createArtifact({
        name: artifactName.trim(),
        url: artifactUrl.trim(),
        meta: artifactNote ? { note: artifactNote } : {},
      })
      setArtifacts((prev) => [created, ...prev])
      setArtifactName('')
      setArtifactUrl('')
      setArtifactNote('')
      setShowArtifactForm(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create artifact')
    } finally {
      setSavingArtifact(false)
    }
  }

  async function removeArtifact(id: string) {
    setError(null)
    try {
      await api.deleteArtifact(id)
      setArtifacts((prev) => prev.filter((a) => a.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete artifact')
    }
  }

  if (loading) return <PageSpinner label="Loading evidence registry..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Conformity Evidence</h1>
          <p className="mt-1 text-sm text-slate-400">
            Annex IV technical-documentation registry and reusable evidence artifacts.
          </p>
        </div>
        <Button onClick={() => setShowArtifactForm(true)}>+ New Artifact</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Requirements" value={stats.total} hint={`${stats.required} required`} accent="indigo" />
        <Stat label="Readiness" value={`${stats.readiness}%`} hint="approved / required" accent={stats.readiness === 100 ? 'green' : 'amber'} />
        <Stat label="Open Gaps" value={stats.gaps} hint="missing or in-progress" accent={stats.gaps ? 'red' : 'green'} />
        <Stat label="Approved" value={stats.approved} hint="across all systems" accent="green" />
      </div>

      {/* Readiness by category */}
      {categoryReadiness.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-200">Readiness by Annex IV Category</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            {categoryReadiness.map((c) => (
              <div key={c.category}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-300">{c.category}</span>
                  <span className="text-slate-500">
                    {c.approved}/{c.total} approved · {c.pct}%
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full rounded-full ${c.pct === 100 ? 'bg-emerald-500' : c.pct >= 50 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className={inputCls()}
            placeholder="Search requirements..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={inputCls()} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select className={inputCls()} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className={inputCls()} value={reviewerFilter} onChange={(e) => setReviewerFilter(e.target.value)}>
            <option value="">All reviewers</option>
            {reviewers.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </CardBody>
      </Card>

      {/* Requirements table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="No evidence requirements"
          description="Evidence requirements are generated when systems are classified. Adjust filters or classify a system to populate the registry."
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Requirement</TH>
              <TH>Category</TH>
              <TH>Status</TH>
              <TH>Artifact</TH>
              <TH>Reviewer</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((r) => (
              <TR key={r.id}>
                <TD>
                  <div className="font-medium text-slate-100">{r.title}</div>
                  <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">{r.requirement_code}</span>
                    {r.required ? (
                      <Badge tone="indigo">required</Badge>
                    ) : (
                      <Badge tone="slate">optional</Badge>
                    )}
                  </div>
                </TD>
                <TD className="text-slate-400">{r.category}</TD>
                <TD>
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </TD>
                <TD>
                  {r.artifact_url ? (
                    <a
                      href={r.artifact_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-300 underline-offset-2 hover:underline"
                    >
                      View
                    </a>
                  ) : artifacts.length > 0 ? (
                    <select
                      className={inputCls('max-w-[11rem]')}
                      defaultValue=""
                      disabled={rowBusy === r.id}
                      onChange={(e) => {
                        if (e.target.value) attachArtifact(r, e.target.value)
                      }}
                    >
                      <option value="">Link artifact...</option>
                      {artifacts.map((a) => (
                        <option key={a.id} value={a.url}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-slate-600">none</span>
                  )}
                </TD>
                <TD className="text-slate-400">{r.reviewer || '—'}</TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    {r.status !== 'approved' && (
                      <Button
                        variant="ghost"
                        className="px-2 py-1 text-xs text-emerald-300"
                        disabled={rowBusy === r.id}
                        onClick={() => quickStatus(r, 'approved')}
                      >
                        Approve
                      </Button>
                    )}
                    <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEdit(r)}>
                      Edit
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Reusable artifacts */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Reusable Artifacts</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Documents you can link to multiple Annex IV requirements across systems.
            </p>
          </div>
          <Button variant="secondary" className="text-xs" onClick={() => setShowArtifactForm(true)}>
            + Add
          </Button>
        </CardHeader>
        <CardBody>
          {artifacts.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">
              No reusable artifacts yet. Add one to link evidence across systems.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {artifacts.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-col rounded-lg border border-slate-800 bg-slate-950/40 p-4"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-slate-100">{a.name}</span>
                    <button
                      onClick={() => removeArtifact(a.id)}
                      className="text-slate-500 hover:text-red-400"
                      aria-label="Delete artifact"
                    >
                      ✕
                    </button>
                  </div>
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 truncate text-xs text-indigo-300 hover:underline"
                  >
                    {a.url}
                  </a>
                  {a.meta && typeof (a.meta as Record<string, unknown>).note === 'string' && (
                    <p className="mt-2 text-xs text-slate-400">
                      {String((a.meta as Record<string, unknown>).note)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Edit requirement modal */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing ? editing.title : 'Edit requirement'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={saveRequirement} disabled={savingReq}>
              {savingReq ? 'Saving...' : 'Save'}
            </Button>
          </>
        }
      >
        {editing && (
          <div className="space-y-4">
            <div className="text-xs text-slate-500">
              <span className="font-mono">{editing.requirement_code}</span> · {editing.category}
            </div>
            {editing.description && <p className="text-sm text-slate-400">{editing.description}</p>}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Status</label>
              <select className={inputCls()} value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Artifact URL</label>
              <input
                className={inputCls()}
                placeholder="https://..."
                value={editArtifactUrl}
                onChange={(e) => setEditArtifactUrl(e.target.value)}
              />
              {artifacts.length > 0 && (
                <select
                  className={inputCls('mt-2')}
                  defaultValue=""
                  onChange={(e) => e.target.value && setEditArtifactUrl(e.target.value)}
                >
                  <option value="">Pick from reusable artifacts...</option>
                  {artifacts.map((a) => (
                    <option key={a.id} value={a.url}>
                      {a.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Reviewer</label>
              <input
                className={inputCls()}
                placeholder="reviewer name"
                value={editReviewer}
                onChange={(e) => setEditReviewer(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Notes</label>
              <textarea
                className={inputCls('min-h-[80px]')}
                placeholder="Review notes..."
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* New artifact modal */}
      <Modal
        open={showArtifactForm}
        onClose={() => setShowArtifactForm(false)}
        title="New evidence artifact"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowArtifactForm(false)}>
              Cancel
            </Button>
            <Button onClick={createArtifact} disabled={savingArtifact || !artifactName.trim() || !artifactUrl.trim()}>
              {savingArtifact ? 'Creating...' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
            <input
              className={inputCls()}
              placeholder="e.g. Risk Management Plan v2"
              value={artifactName}
              onChange={(e) => setArtifactName(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">URL</label>
            <input
              className={inputCls()}
              placeholder="https://..."
              value={artifactUrl}
              onChange={(e) => setArtifactUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-400">Note (optional)</label>
            <textarea
              className={inputCls('min-h-[70px]')}
              placeholder="Short description..."
              value={artifactNote}
              onChange={(e) => setArtifactNote(e.target.value)}
            />
          </div>
        </div>
      </Modal>
    </div>
  )
}
