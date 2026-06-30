'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'
import { Badge, tierTone, statusTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/button'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Modal } from '@/components/ui/Modal'

interface AiSystem {
  id: string
  name: string
  description?: string
  intended_purpose?: string
  role: string
  modality?: string
  current_tier?: string | null
  status?: string
  is_gpai?: boolean
  is_systemic_risk?: boolean
  archived?: boolean
  tags?: string[]
  updated_at?: string
}

interface Tag {
  id: string
  name: string
  color?: string
}

interface SavedFilter {
  id: string
  name: string
  scope?: string
  criteria?: Record<string, string>
}

const TIERS = ['prohibited', 'high', 'limited', 'minimal']
const STATUSES = ['draft', 'classified', 'under_review', 'registered']
const TIER_LABEL: Record<string, string> = {
  prohibited: 'Prohibited',
  high: 'High',
  limited: 'Limited',
  minimal: 'Minimal',
}

function fmtDate(s?: string): string {
  if (!s) return '—'
  const d = new Date(s)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function SystemsPage() {
  const [systems, setSystems] = useState<AiSystem[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  // Filter state
  const [q, setQ] = useState('')
  const [tier, setTier] = useState('')
  const [status, setStatus] = useState('')
  const [tag, setTag] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // Selection / bulk
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkOwner, setBulkOwner] = useState('')
  const [busy, setBusy] = useState(false)

  // Save-filter modal
  const [saveOpen, setSaveOpen] = useState(false)
  const [filterName, setFilterName] = useState('')

  const loadSystems = useCallback(async () => {
    const params: Record<string, string | boolean> = {}
    if (tier) params.tier = tier
    if (status) params.status = status
    if (tag) params.tag = tag
    params.archived = showArchived
    const list = (await api.listSystems(params)) as AiSystem[]
    setSystems(Array.isArray(list) ? list : [])
  }, [tier, status, tag, showArchived])

  // Initial load of systems + tags + saved filters.
  useEffect(() => {
    let active = true
    Promise.all([api.listSystems({ archived: false }), api.listTags(), api.listFilters()])
      .then(([sys, tg, fl]) => {
        if (!active) return
        setSystems(Array.isArray(sys) ? (sys as AiSystem[]) : [])
        setTags(Array.isArray(tg) ? (tg as Tag[]) : [])
        setFilters(Array.isArray(fl) ? (fl as SavedFilter[]) : [])
      })
      .catch((e) => active && setError(e?.message || 'Failed to load systems.'))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  // Re-fetch when server-side filters change (after initial load).
  useEffect(() => {
    if (loading) return
    loadSystems().catch((e) => setActionError(e?.message || 'Failed to apply filters.'))
    setSelected(new Set())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tier, status, tag, showArchived])

  // Client-side text search over the server-filtered list.
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return systems
    return systems.filter(
      (sys) =>
        sys.name?.toLowerCase().includes(needle) ||
        sys.description?.toLowerCase().includes(needle) ||
        sys.intended_purpose?.toLowerCase().includes(needle),
    )
  }, [systems, q])

  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id))

  const toggleAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set()
      return new Set(visible.map((s) => s.id))
    })
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearFilters = () => {
    setQ('')
    setTier('')
    setStatus('')
    setTag('')
    setShowArchived(false)
  }

  const applySavedFilter = (f: SavedFilter) => {
    const c = f.criteria ?? {}
    setTier(c.tier ?? '')
    setStatus(c.status ?? '')
    setTag(c.tag ?? '')
    setQ(c.q ?? '')
    setShowArchived(c.archived === 'true')
  }

  const saveCurrentFilter = async () => {
    if (!filterName.trim()) return
    setBusy(true)
    setActionError('')
    try {
      const criteria: Record<string, string> = {}
      if (tier) criteria.tier = tier
      if (status) criteria.status = status
      if (tag) criteria.tag = tag
      if (q.trim()) criteria.q = q.trim()
      if (showArchived) criteria.archived = 'true'
      const created = (await api.createFilter({
        name: filterName.trim(),
        scope: 'systems',
        criteria,
      })) as SavedFilter
      setFilters((prev) => [...prev, created])
      setSaveOpen(false)
      setFilterName('')
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to save filter.')
    } finally {
      setBusy(false)
    }
  }

  const removeFilter = async (id: string) => {
    setActionError('')
    try {
      await api.deleteFilter(id)
      setFilters((prev) => prev.filter((f) => f.id !== id))
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Failed to delete filter.')
    }
  }

  const archiveSelected = async (archived: boolean) => {
    if (selected.size === 0) return
    setBusy(true)
    setActionError('')
    try {
      await Promise.all([...selected].map((id) => api.archiveSystem(id, archived)))
      await loadSystems()
      setSelected(new Set())
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Bulk archive failed.')
    } finally {
      setBusy(false)
    }
  }

  const applyBulkPatch = async () => {
    if (selected.size === 0) return
    const patch: Record<string, string> = {}
    if (bulkStatus) patch.status = bulkStatus
    if (bulkOwner.trim()) patch.owner = bulkOwner.trim()
    if (Object.keys(patch).length === 0) {
      setActionError('Choose a status or owner to apply.')
      return
    }
    setBusy(true)
    setActionError('')
    try {
      await api.bulkUpdateSystems({ ids: [...selected], patch })
      await loadSystems()
      setSelected(new Set())
      setBulkStatus('')
      setBulkOwner('')
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Bulk update failed.')
    } finally {
      setBusy(false)
    }
  }

  const reclassifySelected = async () => {
    if (selected.size === 0) return
    setBusy(true)
    setActionError('')
    try {
      await api.bulkReclassify({ ids: [...selected] })
      await loadSystems()
      setSelected(new Set())
    } catch (e: unknown) {
      setActionError(e instanceof Error ? e.message : 'Bulk reclassify failed.')
    } finally {
      setBusy(false)
    }
  }

  const hasActiveFilters = Boolean(q || tier || status || tag || showArchived)

  if (loading) return <PageSpinner label="Loading systems..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">AI System Register</h1>
          <p className="mt-1 text-sm text-slate-400">
            {visible.length} system{visible.length === 1 ? '' : 's'}
            {hasActiveFilters ? ' (filtered)' : ''}
          </p>
        </div>
        <Link href="/dashboard/systems/new">
          <Button>Register system</Button>
        </Link>
      </div>

      {error && (
        <Card>
          <CardBody>
            <EmptyState
              title="Could not load systems"
              description={error}
              action={
                <Button variant="secondary" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              }
            />
          </CardBody>
        </Card>
      )}

      {!error && (
        <>
          {/* Filter bar */}
          <Card>
            <CardBody className="space-y-3">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search name or purpose..."
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none lg:col-span-2"
                />
                <select
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">All tiers</option>
                  {TIERS.map((t) => (
                    <option key={t} value={t}>
                      {TIER_LABEL[t]}
                    </option>
                  ))}
                </select>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">All statuses</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">All tags</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={showArchived}
                    onChange={(e) => setShowArchived(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
                  />
                  Show archived
                </label>
                <div className="flex-1" />
                {hasActiveFilters && (
                  <Button variant="ghost" onClick={clearFilters}>
                    Clear
                  </Button>
                )}
                <Button variant="secondary" onClick={() => setSaveOpen(true)} disabled={!hasActiveFilters}>
                  Save filter
                </Button>
              </div>

              {filters.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Saved
                  </span>
                  {filters.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/60 py-0.5 pl-3 pr-1.5 text-xs text-slate-200"
                    >
                      <button onClick={() => applySavedFilter(f)} className="hover:text-indigo-300">
                        {f.name}
                      </button>
                      <button
                        onClick={() => removeFilter(f.id)}
                        className="text-slate-500 hover:text-red-400"
                        aria-label={`Delete ${f.name}`}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          {actionError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
              {actionError}
            </div>
          )}

          {/* Bulk action bar */}
          {selected.size > 0 && (
            <Card className="border-indigo-500/40">
              <CardBody className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-medium text-indigo-300">{selected.size} selected</span>
                <div className="flex-1" />
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">Set status...</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
                <input
                  value={bulkOwner}
                  onChange={(e) => setBulkOwner(e.target.value)}
                  placeholder="Owner..."
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
                />
                <Button variant="secondary" onClick={applyBulkPatch} disabled={busy}>
                  Apply
                </Button>
                <Button variant="secondary" onClick={reclassifySelected} disabled={busy}>
                  Reclassify
                </Button>
                {showArchived ? (
                  <Button variant="secondary" onClick={() => archiveSelected(false)} disabled={busy}>
                    Restore
                  </Button>
                ) : (
                  <Button variant="danger" onClick={() => archiveSelected(true)} disabled={busy}>
                    Archive
                  </Button>
                )}
              </CardBody>
            </Card>
          )}

          {/* Table */}
          {visible.length === 0 ? (
            <Card>
              <CardBody>
                <EmptyState
                  title={hasActiveFilters ? 'No systems match your filters' : 'No systems registered'}
                  description={
                    hasActiveFilters
                      ? 'Try clearing the filters to see your full register.'
                      : 'Register your first AI system to begin classification.'
                  }
                  action={
                    hasActiveFilters ? (
                      <Button variant="secondary" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    ) : (
                      <Link href="/dashboard/systems/new">
                        <Button>Register system</Button>
                      </Link>
                    )
                  }
                />
              </CardBody>
            </Card>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
                      aria-label="Select all"
                    />
                  </TH>
                  <TH>System</TH>
                  <TH>Role</TH>
                  <TH>Tier</TH>
                  <TH>Status</TH>
                  <TH>Tags</TH>
                  <TH>Updated</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((sys) => (
                  <TR key={sys.id} className={selected.has(sys.id) ? 'bg-indigo-500/5' : ''}>
                    <TD>
                      <input
                        type="checkbox"
                        checked={selected.has(sys.id)}
                        onChange={() => toggleOne(sys.id)}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
                        aria-label={`Select ${sys.name}`}
                      />
                    </TD>
                    <TD>
                      <Link
                        href={`/dashboard/systems/${sys.id}`}
                        className="font-medium text-slate-100 hover:text-indigo-300"
                      >
                        {sys.name}
                      </Link>
                      <div className="flex items-center gap-1.5">
                        {sys.is_gpai && <Badge tone="indigo">GPAI</Badge>}
                        {sys.is_systemic_risk && <Badge tone="red">Systemic</Badge>}
                        {sys.archived && <Badge tone="slate">Archived</Badge>}
                      </div>
                    </TD>
                    <TD className="capitalize text-slate-300">{sys.role?.replace(/_/g, ' ')}</TD>
                    <TD>
                      {sys.current_tier ? (
                        <Badge tone={tierTone(sys.current_tier)}>
                          {TIER_LABEL[sys.current_tier] || sys.current_tier}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-500">unclassified</span>
                      )}
                    </TD>
                    <TD>
                      <Badge tone={statusTone(sys.status)}>{(sys.status || 'draft').replace(/_/g, ' ')}</Badge>
                    </TD>
                    <TD>
                      <div className="flex flex-wrap gap-1">
                        {(sys.tags ?? []).slice(0, 3).map((t) => (
                          <Badge key={t} tone="slate">
                            {t}
                          </Badge>
                        ))}
                        {(sys.tags?.length ?? 0) > 3 && (
                          <span className="text-xs text-slate-500">+{(sys.tags?.length ?? 0) - 3}</span>
                        )}
                      </div>
                    </TD>
                    <TD className="text-xs text-slate-500">{fmtDate(sys.updated_at)}</TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          href={`/dashboard/systems/${sys.id}/classify`}
                          className="text-xs font-medium text-indigo-400 hover:text-indigo-300"
                        >
                          Classify
                        </Link>
                        <button
                          onClick={async () => {
                            setActionError('')
                            try {
                              await api.archiveSystem(sys.id, !sys.archived)
                              await loadSystems()
                            } catch (e: unknown) {
                              setActionError(e instanceof Error ? e.message : 'Action failed.')
                            }
                          }}
                          className="text-xs font-medium text-slate-400 hover:text-amber-300"
                        >
                          {sys.archived ? 'Restore' : 'Archive'}
                        </button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </>
      )}

      {/* Save filter modal */}
      <Modal
        open={saveOpen}
        onClose={() => setSaveOpen(false)}
        title="Save current filter"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSaveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveCurrentFilter} disabled={busy || !filterName.trim()}>
              Save
            </Button>
          </>
        }
      >
        <label className="block text-sm text-slate-300">
          Filter name
          <input
            value={filterName}
            onChange={(e) => setFilterName(e.target.value)}
            placeholder="e.g. High-risk in review"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            autoFocus
          />
        </label>
        <p className="mt-3 text-xs text-slate-500">
          Captures the active tier, status, tag, search, and archived toggle.
        </p>
      </Modal>
    </div>
  )
}
