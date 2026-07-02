'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import api from '@/lib/api'
import { Card, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { Spinner } from '@/components/ui/Spinner'

type TypedResult = {
  type?: string
  id?: string
  system_id?: string
  title?: string
  name?: string
  label?: string
  subtitle?: string
  description?: string
  snippet?: string
  tier?: string
  status?: string
  article_ref?: string
}

// Maps a result entity type to its dashboard destination + display metadata.
const TYPE_META: Record<string, { label: string; tone: 'indigo' | 'amber' | 'green' | 'red' | 'slate' | 'blue'; icon: string }> = {
  system: { label: 'AI System', tone: 'indigo', icon: '◈' },
  systems: { label: 'AI System', tone: 'indigo', icon: '◈' },
  obligation: { label: 'Obligation', tone: 'amber', icon: '§' },
  obligations: { label: 'Obligation', tone: 'amber', icon: '§' },
  evidence: { label: 'Evidence', tone: 'green', icon: '✓' },
  evidence_requirement: { label: 'Evidence', tone: 'green', icon: '✓' },
  notice: { label: 'Notice', tone: 'blue', icon: '¶' },
  notices: { label: 'Notice', tone: 'blue', icon: '¶' },
  transparency_notice: { label: 'Notice', tone: 'blue', icon: '¶' },
  registry: { label: 'Registry', tone: 'slate', icon: '⌗' },
  registry_package: { label: 'Registry', tone: 'slate', icon: '⌗' },
}

function metaFor(type?: string) {
  return TYPE_META[(type ?? '').toLowerCase()] ?? { label: type || 'Result', tone: 'slate' as const, icon: '•' }
}

// Best-effort destination link for a typed search result.
function hrefFor(r: TypedResult): string {
  const t = (r.type ?? '').toLowerCase()
  const sid = r.system_id || r.id
  if (t.startsWith('system')) return `/dashboard/systems/${r.id}`
  if (t.startsWith('oblig')) return '/dashboard/obligations'
  if (t.startsWith('evidence')) return '/dashboard/evidence'
  if (t.startsWith('notice') || t.startsWith('transparency')) return '/dashboard/notices'
  if (t.startsWith('registry')) return sid ? `/dashboard/systems/${sid}` : '/dashboard/registry'
  return '/dashboard'
}

function titleFor(r: TypedResult): string {
  return r.title || r.name || r.label || 'Untitled'
}

function subtitleFor(r: TypedResult): string {
  return r.subtitle || r.snippet || r.description || r.article_ref || ''
}

export default function SearchPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialQ = searchParams.get('q') ?? ''

  const [query, setQuery] = useState(initialQ)
  const [submitted, setSubmitted] = useState(initialQ)
  const [results, setResults] = useState<TypedResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<string>('all')

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setResults([])
      setSubmitted('')
      return
    }
    setLoading(true)
    setError(null)
    setSubmitted(trimmed)
    try {
      const res = await api.search(trimmed)
      const list: TypedResult[] = Array.isArray(res?.results)
        ? res.results
        : Array.isArray(res)
          ? res
          : []
      setResults(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Search failed')
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Run an initial search when the page is opened with a ?q= param.
  useEffect(() => {
    if (initialQ.trim()) runSearch(initialQ)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    router.replace(`/dashboard/search${params.toString() ? `?${params.toString()}` : ''}`)
    runSearch(query)
    setActiveType('all')
  }

  const typeCounts = results.reduce<Record<string, number>>((acc, r) => {
    const key = metaFor(r.type).label
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})

  const visible = activeType === 'all'
    ? results
    : results.filter((r) => metaFor(r.type).label === activeType)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-100">Search</h1>
        <p className="mt-1 text-sm text-stone-400">
          Search across AI systems, obligations, evidence, transparency notices, and registry packages.
        </p>
      </div>

      <Card>
        <CardBody>
          <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500">⌕</span>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search systems, obligations, evidence, notices…"
                className="w-full rounded-lg border border-stone-700 bg-stone-950/60 py-2 pl-9 pr-3 text-sm text-stone-100 placeholder-stone-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Searching…' : 'Search'}
            </Button>
          </form>
        </CardBody>
      </Card>

      {loading && (
        <div className="py-12">
          <Spinner label="Searching…" />
        </div>
      )}

      {error && !loading && (
        <Card>
          <CardBody>
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-sm text-red-300">{error}</p>
              <Button variant="secondary" onClick={() => runSearch(submitted)}>
                Retry
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {!loading && !error && submitted && results.length === 0 && (
        <EmptyState
          icon={<span>⌕</span>}
          title="No results"
          description={`Nothing matched "${submitted}". Try a different term.`}
        />
      )}

      {!loading && !error && !submitted && (
        <EmptyState
          icon={<span>⌕</span>}
          title="Start searching"
          description="Enter a term above to search across your entire compliance workspace."
        />
      )}

      {!loading && !error && results.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setActiveType('all')}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                activeType === 'all'
                  ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                  : 'border-stone-700 text-stone-400 hover:text-stone-200'
              }`}
            >
              All {results.length}
            </button>
            {Object.entries(typeCounts).map(([label, count]) => (
              <button
                key={label}
                onClick={() => setActiveType(label)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  activeType === label
                    ? 'border-rose-500/50 bg-rose-500/15 text-rose-200'
                    : 'border-stone-700 text-stone-400 hover:text-stone-200'
                }`}
              >
                {label} {count}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {visible.map((r, i) => {
              const meta = metaFor(r.type)
              const subtitle = subtitleFor(r)
              return (
                <Link key={`${r.type}-${r.id}-${i}`} href={hrefFor(r)} className="block">
                  <div className="flex items-start gap-4 rounded-xl border border-stone-800 bg-stone-900/60 px-5 py-4 transition-colors hover:border-rose-500/40 hover:bg-stone-900">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-stone-700 bg-stone-950/60 text-lg text-rose-300">
                      {meta.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-stone-100">{titleFor(r)}</span>
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                        {r.tier && <Badge tone="amber">{r.tier}</Badge>}
                        {r.status && <Badge tone="slate">{r.status}</Badge>}
                      </div>
                      {subtitle && <p className="mt-1 line-clamp-2 text-sm text-stone-400">{subtitle}</p>}
                    </div>
                    <span className="mt-1 shrink-0 text-stone-600">→</span>
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
