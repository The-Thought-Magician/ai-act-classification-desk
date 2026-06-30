'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'

type Tag = {
  id: string
  name: string
  color?: string | null
  created_at?: string
}

type SavedFilter = {
  id: string
  name: string
  scope?: string | null
  criteria?: Record<string, unknown> | null
  created_at?: string
}

const COLOR_OPTIONS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#10b981', label: 'Emerald' },
  { value: '#ef4444', label: 'Red' },
  { value: '#0ea5e9', label: 'Sky' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#64748b', label: 'Slate' },
]

const SCOPE_OPTIONS = ['systems', 'obligations', 'evidence', 'notices', 'registry']

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([])
  const [filters, setFilters] = useState<SavedFilter[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Tag creation form state.
  const [tagName, setTagName] = useState('')
  const [tagColor, setTagColor] = useState(COLOR_OPTIONS[0].value)
  const [creatingTag, setCreatingTag] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  // Saved-filter modal state.
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [filterName, setFilterName] = useState('')
  const [filterScope, setFilterScope] = useState(SCOPE_OPTIONS[0])
  const [filterCriteria, setFilterCriteria] = useState('{\n  "status": "in-progress"\n}')
  const [savingFilter, setSavingFilter] = useState(false)
  const [filterError, setFilterError] = useState<string | null>(null)

  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [t, f] = await Promise.all([api.listTags(), api.listFilters()])
      setTags(Array.isArray(t) ? t : Array.isArray(t?.tags) ? t.tags : [])
      setFilters(Array.isArray(f) ? f : Array.isArray(f?.filters) ? f.filters : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tags and filters')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreateTag(e: React.FormEvent) {
    e.preventDefault()
    const name = tagName.trim()
    if (!name) {
      setTagError('Tag name is required')
      return
    }
    setCreatingTag(true)
    setTagError(null)
    try {
      const created: Tag = await api.createTag({ name, color: tagColor })
      setTags((prev) => [...prev, created].filter(Boolean))
      setTagName('')
      setTagColor(COLOR_OPTIONS[0].value)
      // Reload to stay in sync if backend normalizes/dedupes.
      load()
    } catch (e) {
      setTagError(e instanceof Error ? e.message : 'Failed to create tag')
    } finally {
      setCreatingTag(false)
    }
  }

  async function handleDeleteTag(id: string) {
    if (!confirm('Delete this tag? It will be removed from all systems.')) return
    setBusyId(id)
    try {
      await api.deleteTag(id)
      setTags((prev) => prev.filter((t) => t.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete tag')
    } finally {
      setBusyId(null)
    }
  }

  async function handleCreateFilter(e: React.FormEvent) {
    e.preventDefault()
    const name = filterName.trim()
    if (!name) {
      setFilterError('Filter name is required')
      return
    }
    let criteria: unknown
    try {
      criteria = filterCriteria.trim() ? JSON.parse(filterCriteria) : {}
    } catch {
      setFilterError('Criteria must be valid JSON')
      return
    }
    setSavingFilter(true)
    setFilterError(null)
    try {
      const created: SavedFilter = await api.createFilter({ name, scope: filterScope, criteria })
      setFilters((prev) => [...prev, created].filter(Boolean))
      setFilterModalOpen(false)
      setFilterName('')
      setFilterScope(SCOPE_OPTIONS[0])
      setFilterCriteria('{\n  "status": "in-progress"\n}')
      load()
    } catch (e) {
      setFilterError(e instanceof Error ? e.message : 'Failed to create filter')
    } finally {
      setSavingFilter(false)
    }
  }

  async function handleDeleteFilter(id: string) {
    if (!confirm('Delete this saved filter?')) return
    setBusyId(id)
    try {
      await api.deleteFilter(id)
      setFilters((prev) => prev.filter((f) => f.id !== id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete filter')
    } finally {
      setBusyId(null)
    }
  }

  if (loading) return <PageSpinner label="Loading tags and filters…" />

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Tags & Saved Filters</h1>
        <p className="mt-1 text-sm text-slate-400">
          Organize AI systems with tags and save reusable views across the workspace.
        </p>
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Tags column */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Tags</h2>
              <p className="text-xs text-slate-500">{tags.length} tag{tags.length === 1 ? '' : 's'}</p>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            <form onSubmit={handleCreateTag} className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    New tag
                  </label>
                  <input
                    value={tagName}
                    onChange={(e) => setTagName(e.target.value)}
                    placeholder="e.g. customer-facing"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Color
                  </label>
                  <div className="flex gap-1.5">
                    {COLOR_OPTIONS.map((c) => (
                      <button
                        key={c.value}
                        type="button"
                        title={c.label}
                        onClick={() => setTagColor(c.value)}
                        className={`h-7 w-7 rounded-full border-2 transition-transform ${
                          tagColor === c.value ? 'scale-110 border-white' : 'border-transparent'
                        }`}
                        style={{ backgroundColor: c.value }}
                      />
                    ))}
                  </div>
                </div>
                <Button type="submit" disabled={creatingTag}>
                  {creatingTag ? 'Adding…' : 'Add tag'}
                </Button>
              </div>
              {tagError && <p className="text-xs text-red-300">{tagError}</p>}
            </form>

            {tags.length === 0 ? (
              <EmptyState
                icon={<span>#</span>}
                title="No tags yet"
                description="Create your first tag to start labeling AI systems."
              />
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => (
                  <span
                    key={t.id}
                    className="group inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/60 py-1 pl-2 pr-1 text-sm text-slate-200"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: t.color || '#64748b' }}
                    />
                    {t.name}
                    <button
                      onClick={() => handleDeleteTag(t.id)}
                      disabled={busyId === t.id}
                      aria-label={`Delete ${t.name}`}
                      className="flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-50"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Saved filters column */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-100">Saved Filters</h2>
              <p className="text-xs text-slate-500">{filters.length} filter{filters.length === 1 ? '' : 's'}</p>
            </div>
            <Button onClick={() => setFilterModalOpen(true)}>New filter</Button>
          </CardHeader>
          <CardBody>
            {filters.length === 0 ? (
              <EmptyState
                icon={<span>⛃</span>}
                title="No saved filters"
                description="Save a filter to quickly reapply a view across systems and obligations."
                action={<Button onClick={() => setFilterModalOpen(true)}>Create filter</Button>}
              />
            ) : (
              <ul className="space-y-2">
                {filters.map((f) => {
                  const criteriaEntries = f.criteria && typeof f.criteria === 'object'
                    ? Object.entries(f.criteria)
                    : []
                  return (
                    <li
                      key={f.id}
                      className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-100">{f.name}</span>
                            {f.scope && <Badge tone="indigo">{f.scope}</Badge>}
                          </div>
                          {criteriaEntries.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {criteriaEntries.map(([k, v]) => (
                                <span
                                  key={k}
                                  className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-400"
                                >
                                  {k}: <span className="text-slate-200">{String(v)}</span>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-xs text-slate-500">No criteria</p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          onClick={() => handleDeleteFilter(f.id)}
                          disabled={busyId === f.id}
                          aria-label={`Delete ${f.name}`}
                        >
                          ✕
                        </Button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        title="New saved filter"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFilterModalOpen(false)}>Cancel</Button>
            <Button type="submit" form="filter-form" disabled={savingFilter}>
              {savingFilter ? 'Saving…' : 'Save filter'}
            </Button>
          </>
        }
      >
        <form id="filter-form" onSubmit={handleCreateFilter} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Name</label>
            <input
              value={filterName}
              onChange={(e) => setFilterName(e.target.value)}
              placeholder="e.g. High-risk in progress"
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Scope</label>
            <select
              value={filterScope}
              onChange={(e) => setFilterScope(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {SCOPE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
              Criteria (JSON)
            </label>
            <textarea
              value={filterCriteria}
              onChange={(e) => setFilterCriteria(e.target.value)}
              rows={5}
              spellCheck={false}
              className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 font-mono text-xs text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <p className="mt-1 text-xs text-slate-500">
              Key/value pairs applied as query params, e.g. {'{ "tier": "high", "status": "in-progress" }'}
            </p>
          </div>
          {filterError && <p className="text-xs text-red-300">{filterError}</p>}
        </form>
      </Modal>
    </div>
  )
}
