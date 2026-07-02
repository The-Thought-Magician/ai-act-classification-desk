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

interface Webhook {
  id: string
  user_id: string
  url: string
  events: string[]
  secret?: string
  active: boolean
  created_at: string
}

interface WebhookDelivery {
  id: string
  webhook_id: string
  event: string
  payload: unknown
  status_code: number | null
  ok: boolean
  created_at: string
}

// The classifier and compliance engine emit these domain events.
const EVENT_CATALOG = [
  'system.created',
  'system.updated',
  'system.archived',
  'classification.run',
  'classification.override',
  'role.flipped',
  'obligation.updated',
  'evidence.updated',
  'notice.published',
  'registry.submitted',
  'deadline.due',
]

function fmt(ts?: string): string {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d.getTime())) return ts
  return d.toLocaleString()
}

function relTime(ts?: string): string {
  if (!ts) return '—'
  const d = new Date(ts).getTime()
  if (isNaN(d)) return ts
  const diff = Date.now() - d
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const emptyForm = { url: '', events: [] as string[], active: true }

export default function WebhooksPage() {
  const [hooks, setHooks] = useState<Webhook[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // create / edit modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Webhook | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)

  // delivery log drawer
  const [selected, setSelected] = useState<Webhook | null>(null)
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [deliveriesLoading, setDeliveriesLoading] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [banner, setBanner] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.listWebhooks()
      setHooks(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load webhooks')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const loadDeliveries = useCallback(async (hook: Webhook) => {
    setSelected(hook)
    setDeliveriesLoading(true)
    setExpanded(null)
    try {
      const data = await api.getWebhookDeliveries(hook.id)
      setDeliveries(Array.isArray(data) ? data : [])
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Failed to load deliveries')
      setDeliveries([])
    } finally {
      setDeliveriesLoading(false)
    }
  }, [])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setFormError(null)
    setModalOpen(true)
  }

  function openEdit(h: Webhook) {
    setEditing(h)
    setForm({ url: h.url, events: Array.isArray(h.events) ? h.events : [], active: h.active })
    setFormError(null)
    setModalOpen(true)
  }

  function toggleEvent(ev: string) {
    setForm((f) => ({
      ...f,
      events: f.events.includes(ev) ? f.events.filter((e) => e !== ev) : [...f.events, ev],
    }))
  }

  async function submit() {
    if (!form.url.trim()) {
      setFormError('Endpoint URL is required')
      return
    }
    try {
      // basic URL sanity check
      new URL(form.url)
    } catch {
      setFormError('Enter a valid URL (https://…)')
      return
    }
    if (form.events.length === 0) {
      setFormError('Select at least one event to subscribe to')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      if (editing) {
        await api.updateWebhook(editing.id, { url: form.url, events: form.events, active: form.active })
        setBanner('Webhook updated')
      } else {
        await api.createWebhook({ url: form.url, events: form.events, active: form.active })
        setBanner('Webhook created')
      }
      setModalOpen(false)
      await load()
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  async function toggleActive(h: Webhook) {
    try {
      await api.updateWebhook(h.id, { active: !h.active })
      setHooks((prev) => prev.map((x) => (x.id === h.id ? { ...x, active: !x.active } : x)))
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Failed to toggle webhook')
    }
  }

  async function remove(h: Webhook) {
    if (!confirm(`Delete webhook for ${h.url}? This cannot be undone.`)) return
    try {
      await api.deleteWebhook(h.id)
      if (selected?.id === h.id) setSelected(null)
      await load()
      setBanner('Webhook deleted')
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Failed to delete webhook')
    }
  }

  async function test(h: Webhook) {
    setTestingId(h.id)
    try {
      const delivery = await api.testWebhook(h.id)
      setBanner(
        delivery && typeof delivery === 'object' && 'ok' in delivery
          ? `Test delivery ${(delivery as WebhookDelivery).ok ? 'succeeded' : 'failed'} (HTTP ${(delivery as WebhookDelivery).status_code ?? 'n/a'})`
          : 'Test delivery sent',
      )
      if (selected?.id === h.id) await loadDeliveries(h)
    } catch (e) {
      setBanner(e instanceof Error ? e.message : 'Test delivery failed')
    } finally {
      setTestingId(null)
    }
  }

  const total = hooks.length
  const activeCount = hooks.filter((h) => h.active).length
  const eventCoverage = new Set(hooks.flatMap((h) => h.events || [])).size

  if (loading) return <PageSpinner label="Loading webhooks…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Webhooks</h1>
          <p className="mt-1 text-sm text-stone-400">
            Push compliance events to your systems. Subscribe to classifier, role-flip, and registry events.
          </p>
        </div>
        <Button onClick={openCreate}>+ New webhook</Button>
      </div>

      {banner && (
        <div className="flex items-center justify-between rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          <span>{banner}</span>
          <button onClick={() => setBanner(null)} className="text-rose-300 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          <span>{error}</span>
          <Button variant="secondary" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Endpoints" value={total} accent="indigo" />
        <Stat label="Active" value={activeCount} accent="green" />
        <Stat label="Distinct events" value={eventCoverage} accent="amber" />
      </div>

      {hooks.length === 0 ? (
        <EmptyState
          title="No webhooks yet"
          description="Register an endpoint to receive real-time notifications when systems are reclassified, roles flip, or registry packages are submitted."
          icon={<span>🔗</span>}
          action={<Button onClick={openCreate}>Add your first webhook</Button>}
        />
      ) : (
        <Card>
          <Table>
            <THead>
              <TR>
                <TH>Endpoint</TH>
                <TH>Events</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {hooks.map((h) => (
                <TR key={h.id} className={selected?.id === h.id ? 'bg-stone-900/60' : ''}>
                  <TD className="max-w-[280px]">
                    <span className="block truncate font-mono text-xs text-stone-200" title={h.url}>
                      {h.url}
                    </span>
                  </TD>
                  <TD>
                    <div className="flex flex-wrap gap-1">
                      {(h.events || []).slice(0, 3).map((ev) => (
                        <Badge key={ev} tone="indigo">
                          {ev}
                        </Badge>
                      ))}
                      {(h.events || []).length > 3 && (
                        <Badge tone="slate">+{(h.events || []).length - 3}</Badge>
                      )}
                      {(h.events || []).length === 0 && <span className="text-xs text-stone-500">none</span>}
                    </div>
                  </TD>
                  <TD>
                    <button onClick={() => toggleActive(h)} title="Toggle active">
                      <Badge tone={h.active ? 'green' : 'slate'}>{h.active ? 'active' : 'paused'}</Badge>
                    </button>
                  </TD>
                  <TD className="whitespace-nowrap text-xs text-stone-400">{fmt(h.created_at)}</TD>
                  <TD>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" onClick={() => loadDeliveries(h)}>
                        Log
                      </Button>
                      <Button variant="ghost" onClick={() => test(h)} disabled={testingId === h.id}>
                        {testingId === h.id ? 'Testing…' : 'Test'}
                      </Button>
                      <Button variant="ghost" onClick={() => openEdit(h)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => remove(h)}>
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}

      {selected && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-stone-100">Delivery log</h2>
              <p className="mt-0.5 truncate font-mono text-xs text-stone-500">{selected.url}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => loadDeliveries(selected)}>
                Refresh
              </Button>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardBody>
            {deliveriesLoading ? (
              <PageSpinner label="Loading deliveries…" />
            ) : deliveries.length === 0 ? (
              <EmptyState
                title="No deliveries yet"
                description="Send a test delivery or trigger a subscribed event to see attempts here."
                action={
                  <Button onClick={() => test(selected)} disabled={testingId === selected.id}>
                    {testingId === selected.id ? 'Sending…' : 'Send test delivery'}
                  </Button>
                }
              />
            ) : (
              <div className="space-y-2">
                {deliveries.map((d) => (
                  <div key={d.id} className="rounded-lg border border-stone-800 bg-stone-900/40">
                    <button
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                    >
                      <div className="flex items-center gap-3">
                        <Badge tone={d.ok ? 'green' : 'red'}>{d.ok ? 'ok' : 'failed'}</Badge>
                        <span className="font-mono text-xs text-stone-200">{d.event}</span>
                        <span className="text-xs text-stone-500">
                          HTTP {d.status_code ?? '—'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-stone-500" title={fmt(d.created_at)}>
                          {relTime(d.created_at)}
                        </span>
                        <span className="text-stone-600">{expanded === d.id ? '▾' : '▸'}</span>
                      </div>
                    </button>
                    {expanded === d.id && (
                      <pre className="max-h-64 overflow-auto border-t border-stone-800 bg-stone-950/60 px-4 py-3 text-xs text-stone-300">
                        {JSON.stringify(d.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Edit webhook' : 'New webhook'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create webhook'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {formError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {formError}
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-400">
              Endpoint URL
            </label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder="https://example.com/hooks/ai-act"
              className="w-full rounded-lg border border-stone-700 bg-stone-950 px-3 py-2 text-sm text-stone-100 focus:border-rose-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-2 block text-xs font-medium uppercase tracking-wide text-stone-400">
              Subscribed events
            </label>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {EVENT_CATALOG.map((ev) => (
                <label
                  key={ev}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-stone-800 bg-stone-950/50 px-3 py-2 text-sm text-stone-300 hover:border-rose-500/40"
                >
                  <input
                    type="checkbox"
                    checked={form.events.includes(ev)}
                    onChange={() => toggleEvent(ev)}
                    className="accent-rose-500"
                  />
                  <span className="font-mono text-xs">{ev}</span>
                </label>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-stone-300">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
              className="accent-rose-500"
            />
            Active (deliver events immediately)
          </label>
          {editing?.secret && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Signing secret: <span className="font-mono">{editing.secret}</span>
            </div>
          )}
        </div>
      </Modal>
    </div>
  )
}
