'use client'

import { useEffect, useState, useCallback } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Stat } from '@/components/ui/Stat'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table'

interface ApiKey {
  id: string
  user_id: string
  name: string
  prefix: string
  last_used_at: string | null
  created_at: string
}

interface Ruleset {
  version?: string
  ruleset_version?: string
  prohibited?: Array<{ code?: string; article_ref?: string; title?: string; description?: string } | string>
  annex_iii?: Array<{ code?: string; category?: string; title?: string; description?: string } | string>
  annexIII?: Array<{ code?: string; category?: string; title?: string; description?: string } | string>
  article50_triggers?: Array<{ code?: string; trigger_code?: string; title?: string; description?: string } | string>
  art50?: Array<{ code?: string; trigger_code?: string; title?: string; description?: string } | string>
  [k: string]: unknown
}

// Read-only API surface — mirrors the public GET routes from the build plan.
const READ_ENDPOINTS = [
  { method: 'GET', path: '/api/v1/systems', desc: 'List your AI systems' },
  { method: 'GET', path: '/api/v1/systems/:id', desc: 'System detail + current tier' },
  { method: 'GET', path: '/api/v1/classify/:systemId', desc: 'Latest classification + cited rule hits' },
  { method: 'GET', path: '/api/v1/obligations', desc: 'All obligations (filter by tier, status, system)' },
  { method: 'GET', path: '/api/v1/evidence', desc: 'Evidence requirements + readiness' },
  { method: 'GET', path: '/api/v1/registry', desc: 'Registry packages + readiness %' },
  { method: 'GET', path: '/api/v1/notices', desc: 'Transparency notices' },
  { method: 'GET', path: '/api/v1/deadlines', desc: 'Aggregated deadlines (overdue / due-soon / upcoming)' },
  { method: 'GET', path: '/api/v1/rulesets/current', desc: 'Current EU AI Act rule-set metadata' },
]

function fmt(ts?: string | null): string {
  if (!ts) return 'never'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

type RuleItem = { code?: string; ref?: string; title?: string; description?: string }

function normalize(arr: unknown): RuleItem[] {
  if (!Array.isArray(arr)) return []
  return arr.map((x) => {
    if (typeof x === 'string') return { title: x }
    const o = x as Record<string, unknown>
    return {
      code: (o.code as string) || (o.trigger_code as string) || (o.requirement_code as string),
      ref: (o.article_ref as string) || (o.ref as string),
      title: (o.title as string) || (o.category as string),
      description: o.description as string,
    }
  })
}

export default function ApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [ruleset, setRuleset] = useState<Ruleset | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'keys' | 'docs' | 'ruleset'>('keys')

  const [modalOpen, setModalOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null)
  const [copied, setCopied] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [k, rs] = await Promise.all([api.listApiKeys(), api.getRuleset().catch(() => null)])
      setKeys(Array.isArray(k) ? k : [])
      setRuleset(rs)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load API keys')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createKey() {
    if (!newName.trim()) {
      setFormError('Give the key a name')
      return
    }
    setCreating(true)
    setFormError(null)
    try {
      const res = await api.createApiKey({ name: newName.trim() })
      const secret =
        (res && typeof res === 'object' && 'secret' in res && (res as { secret: string }).secret) || ''
      setModalOpen(false)
      setNewName('')
      if (secret) {
        setRevealed({ name: newName.trim(), secret })
        setCopied(false)
      } else {
        setBanner('API key created')
      }
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to create key')
    } finally {
      setCreating(false)
    }
  }

  async function revoke(k: ApiKey) {
    if (!confirm(`Revoke key "${k.name}"? Apps using it will stop working immediately.`)) return
    try {
      await api.deleteApiKey(k.id)
      await load()
      setBanner('Key revoked')
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Failed to revoke key')
    }
  }

  async function copySecret() {
    if (!revealed) return
    try {
      await navigator.clipboard.writeText(revealed.secret)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  const rsVersion = ruleset?.version || ruleset?.ruleset_version
  const prohibited = normalize(ruleset?.prohibited)
  const annex = normalize(ruleset?.annex_iii ?? ruleset?.annexIII)
  const art50 = normalize(ruleset?.article50_triggers ?? ruleset?.art50)

  if (loading) return <PageSpinner label="Loading API keys…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">API Keys &amp; Docs</h1>
          <p className="mt-1 text-sm text-stone-400">
            Programmatic access to your classification register, obligations, and the live EU AI Act ruleset.
          </p>
        </div>
        {tab === 'keys' && <Button onClick={() => { setNewName(''); setFormError(null); setModalOpen(true) }}>+ New key</Button>}
      </div>

      {banner && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="text-rose-300 hover:text-white">✕</button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      )}

      <div className="flex gap-1 border-b border-stone-800">
        {([
          ['keys', 'API Keys'],
          ['docs', 'API Reference'],
          ['ruleset', 'Ruleset'],
        ] as const).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              tab === k
                ? 'border-b-2 border-rose-500 text-rose-300'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'keys' && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Stat label="Active keys" value={keys.length} accent="indigo" />
            <Stat label="Used recently" value={keys.filter((k) => k.last_used_at).length} accent="green" />
            <Stat label="Never used" value={keys.filter((k) => !k.last_used_at).length} accent="amber" />
          </div>

          {keys.length === 0 ? (
            <EmptyState
              title="No API keys"
              description="Create a key to access the read API and integrate the classification desk into your own tools."
              icon={<span>🔑</span>}
              action={<Button onClick={() => setModalOpen(true)}>Create a key</Button>}
            />
          ) : (
            <Card>
              <Table>
                <THead>
                  <TR>
                    <TH>Name</TH>
                    <TH>Prefix</TH>
                    <TH>Last used</TH>
                    <TH>Created</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {keys.map((k) => (
                    <TR key={k.id}>
                      <TD className="font-medium text-stone-100">{k.name}</TD>
                      <TD>
                        <span className="font-mono text-xs text-stone-400">{k.prefix}…</span>
                      </TD>
                      <TD className="text-xs text-stone-400">
                        {k.last_used_at ? fmt(k.last_used_at) : <Badge tone="slate">never</Badge>}
                      </TD>
                      <TD className="whitespace-nowrap text-xs text-stone-400">{fmt(k.created_at)}</TD>
                      <TD className="text-right">
                        <Button variant="danger" onClick={() => revoke(k)}>Revoke</Button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      )}

      {tab === 'docs' && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-stone-100">Authentication</h2>
            </CardHeader>
            <CardBody className="space-y-3 text-sm text-stone-300">
              <p>Send your API key as a bearer token on every request:</p>
              <pre className="overflow-x-auto rounded-lg border border-stone-800 bg-stone-950/70 px-4 py-3 text-xs text-stone-300">
{`curl https://api.ai-act-desk.example/api/v1/systems \\
  -H "Authorization: Bearer sk_live_…"`}
              </pre>
              <p className="text-xs text-stone-500">
                Keys are scoped to your account. Write endpoints require an interactive session and are not exposed to API keys.
              </p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="text-base font-semibold text-stone-100">Read endpoints</h2>
            </CardHeader>
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>Method</TH>
                    <TH>Path</TH>
                    <TH>Description</TH>
                  </TR>
                </THead>
                <TBody>
                  {READ_ENDPOINTS.map((e) => (
                    <TR key={e.path}>
                      <TD>
                        <Badge tone="green">{e.method}</Badge>
                      </TD>
                      <TD>
                        <span className="font-mono text-xs text-rose-300">{e.path}</span>
                      </TD>
                      <TD className="text-stone-300">{e.desc}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'ruleset' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-100">Active ruleset</h2>
              {rsVersion && <Badge tone="indigo">v{String(rsVersion)}</Badge>}
            </CardHeader>
            <CardBody className="text-sm text-stone-400">
              The deterministic classifier walks these lists in order: Article 5 prohibited practices, Annex III
              high-risk categories, then Article 50 transparency triggers. Every rule hit is cited back to its
              article.
            </CardBody>
          </Card>

          {!ruleset ? (
            <EmptyState title="Ruleset unavailable" description="Could not load the current ruleset metadata." />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <RuleColumn title="Article 5 — Prohibited" tone="red" items={prohibited} />
              <RuleColumn title="Annex III — High-risk" tone="amber" items={annex} />
              <RuleColumn title="Article 50 — Transparency" tone="blue" items={art50} />
            </div>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="New API key"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={creating}>
              Cancel
            </Button>
            <Button onClick={createKey} disabled={creating}>
              {creating ? 'Creating…' : 'Create key'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {formError}
            </div>
          )}
          <label className="block text-xs font-medium uppercase tracking-wide text-stone-400">Key name</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="CI pipeline, Reporting bot, …"
            className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
          />
          <p className="text-xs text-stone-500">The secret is shown only once after creation. Store it securely.</p>
        </div>
      </Modal>

      <Modal
        open={!!revealed}
        onClose={() => setRevealed(null)}
        title="Copy your new secret"
        footer={
          <Button onClick={() => setRevealed(null)}>Done</Button>
        }
      >
        {revealed && (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              This is the only time the secret for <strong>{revealed.name}</strong> will be displayed. Copy it now.
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 font-mono text-xs text-green-300">
                {revealed.secret}
              </code>
              <Button variant="secondary" onClick={copySecret}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function RuleColumn({
  title,
  tone,
  items,
}: {
  title: string
  tone: 'red' | 'amber' | 'blue'
  items: RuleItem[]
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-100">{title}</h3>
        <Badge tone={tone}>{items.length}</Badge>
      </CardHeader>
      <CardBody>
        {items.length === 0 ? (
          <p className="text-xs text-stone-500">No entries in this ruleset section.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="rounded-lg border border-stone-800 bg-stone-950/40 px-3 py-2">
                <div className="flex items-center gap-2">
                  {it.ref && <span className="font-mono text-xs text-rose-300">{it.ref}</span>}
                  {it.code && <span className="font-mono text-[10px] text-stone-500">{it.code}</span>}
                </div>
                <div className="mt-0.5 text-sm text-stone-200">{it.title || it.code || 'Rule'}</div>
                {it.description && <p className="mt-1 text-xs text-stone-400">{it.description}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  )
}
