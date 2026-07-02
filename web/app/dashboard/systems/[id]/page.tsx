'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, statusTone, tierTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

type Any = Record<string, any>

const TABS = [
  'classification',
  'obligations',
  'evidence',
  'registry',
  'roles',
  'versions',
] as const
type Tab = (typeof TABS)[number]

const ROLES = ['provider', 'deployer', 'importer', 'distributor', 'authorised-representative', 'product-manufacturer']
const STATUSES = ['draft', 'in-progress', 'in-review', 'complete', 'submitted', 'registered']

function fmtDate(v?: string) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function pct(n?: number) {
  if (n === undefined || n === null) return 0
  return Math.round(n <= 1 ? n * 100 : n)
}

function Bar({ value, tone = 'indigo' }: { value: number; tone?: 'indigo' | 'amber' | 'green' | 'red' }) {
  const colors = {
    indigo: 'bg-rose-500',
    amber: 'bg-amber-500',
    green: 'bg-green-500',
    red: 'bg-red-500',
  }
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-stone-800">
      <div className={`h-full rounded-full ${colors[tone]}`} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

export default function SystemDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [tab, setTab] = useState<Tab>('classification')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [system, setSystem] = useState<Any | null>(null)
  const [classification, setClassification] = useState<Any | null>(null)
  const [ruleHits, setRuleHits] = useState<Any[]>([])
  const [obligations, setObligations] = useState<Any[]>([])
  const [evidence, setEvidence] = useState<Any | null>(null)
  const [registry, setRegistry] = useState<Any | null>(null)
  const [roleEvents, setRoleEvents] = useState<Any[]>([])
  const [versions, setVersions] = useState<Any[]>([])
  const [activity, setActivity] = useState<Any[]>([])

  // Edit + tag modals
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<Any>({})
  const [saving, setSaving] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [savingTags, setSavingTags] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [sys, cls, obl, ev, reg, roles, vers, act] = await Promise.all([
        api.getSystem(id),
        api.getClassification(id).catch(() => null),
        api.getSystemObligations(id).catch(() => []),
        api.getSystemEvidence(id).catch(() => null),
        api.getRegistryPackage(id).catch(() => null),
        api.getSystemRoleEvents(id).catch(() => []),
        api.getSystemVersions(id).catch(() => []),
        api.getSystemActivity(id).catch(() => []),
      ])
      setSystem(sys)
      setClassification(cls?.classification ?? null)
      setRuleHits(Array.isArray(cls?.rule_hits) ? cls.rule_hits : [])
      setObligations(Array.isArray(obl) ? obl : [])
      setEvidence(ev)
      setRegistry(reg)
      setRoleEvents(Array.isArray(roles) ? roles : [])
      setVersions(Array.isArray(vers) ? vers : [])
      setActivity(Array.isArray(act) ? act : [])
    } catch (e: any) {
      setError(e?.message || 'Failed to load system')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const openEdit = () => {
    if (!system) return
    setEditForm({
      name: system.name ?? '',
      description: system.description ?? '',
      intended_purpose: system.intended_purpose ?? '',
      purpose_category: system.purpose_category ?? '',
      role: system.role ?? '',
      modality: system.modality ?? '',
      lifecycle_stage: system.lifecycle_stage ?? '',
      status: system.status ?? '',
      placed_on_eu_market: !!system.placed_on_eu_market,
      is_gpai: !!system.is_gpai,
      is_systemic_risk: !!system.is_systemic_risk,
    })
    setEditOpen(true)
  }

  const saveEdit = async () => {
    setSaving(true)
    try {
      const updated = await api.updateSystem(id, editForm)
      setSystem(updated)
      setEditOpen(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to update system')
    } finally {
      setSaving(false)
    }
  }

  const tags: string[] = useMemo(() => (Array.isArray(system?.tags) ? system!.tags : []), [system])

  const addTag = () => {
    const t = tagInput.trim()
    if (!t) return
    if (!tags.includes(t)) setSystem((s) => (s ? { ...s, tags: [...tags, t] } : s))
    setTagInput('')
  }
  const removeTag = (t: string) => setSystem((s) => (s ? { ...s, tags: tags.filter((x) => x !== t) } : s))

  const saveTags = async () => {
    setSavingTags(true)
    try {
      const updated = await api.assignTags({ system_id: id, tags })
      setSystem(updated)
      setTagsOpen(false)
    } catch (e: any) {
      setError(e?.message || 'Failed to save tags')
    } finally {
      setSavingTags(false)
    }
  }

  if (loading) return <PageSpinner label="Loading system..." />

  if (error && !system) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <EmptyState
          title="Could not load this system"
          description={error}
          action={
            <div className="flex gap-2">
              <Button onClick={load}>Retry</Button>
              <Link href="/dashboard/systems"><Button variant="secondary">Back to register</Button></Link>
            </div>
          }
        />
      </div>
    )
  }

  if (!system) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <EmptyState title="System not found" description="It may have been deleted." action={<Link href="/dashboard/systems"><Button>Back to register</Button></Link>} />
      </div>
    )
  }

  const oblComplete = obligations.filter((o) => ['complete', 'submitted', 'registered'].includes(String(o.status))).length
  const oblPct = obligations.length ? Math.round((oblComplete / obligations.length) * 100) : 0
  const reqs: Any[] = Array.isArray(evidence?.requirements) ? evidence!.requirements : []
  const evReadiness = pct(evidence?.readiness_pct)
  const regReadiness = pct(registry?.readiness_pct)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-1 text-xs text-stone-500">
            <Link href="/dashboard/systems" className="hover:text-rose-300">AI Systems</Link>
            <span className="px-1.5">/</span>
            <span className="text-stone-400">{system.name}</span>
          </div>
          <h1 className="truncate text-2xl font-bold text-stone-100">{system.name}</h1>
          <p className="mt-1 max-w-2xl text-sm text-stone-400">{system.description || 'No description provided.'}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={tierTone(system.current_tier)}>{system.current_tier ? `${system.current_tier} risk` : 'unclassified'}</Badge>
            <Badge tone={statusTone(system.status)}>{system.status || 'draft'}</Badge>
            <Badge tone="indigo">{system.role || 'role: n/a'}</Badge>
            {system.is_gpai && <Badge tone="blue">GPAI</Badge>}
            {system.is_systemic_risk && <Badge tone="red">Systemic risk</Badge>}
            {system.placed_on_eu_market && <Badge tone="amber">EU market</Badge>}
            {system.archived && <Badge tone="slate">Archived</Badge>}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {tags.length ? (
              tags.map((t) => <Badge key={t} tone="slate">#{t}</Badge>)
            ) : (
              <span className="text-xs text-stone-600">No tags</span>
            )}
            <button onClick={() => setTagsOpen(true)} className="text-xs text-rose-400 hover:text-rose-300">Edit tags</button>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/dashboard/systems/${id}/classify`}><Button>Run classifier</Button></Link>
          <Button variant="secondary" onClick={openEdit}>Edit</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Risk tier" value={system.current_tier || '—'} accent={system.current_tier === 'high' ? 'amber' : system.current_tier === 'prohibited' ? 'red' : 'indigo'} hint={`ruleset ${classification?.ruleset_version || 'n/a'}`} />
        <Stat label="Obligations" value={`${oblPct}%`} accent={oblPct === 100 ? 'green' : 'amber'} hint={`${oblComplete} / ${obligations.length} complete`} />
        <Stat label="Evidence" value={`${evReadiness}%`} accent={evReadiness === 100 ? 'green' : 'amber'} hint={`${evidence?.gap_count ?? reqs.filter((r) => r.status !== 'complete').length} gaps`} />
        <Stat label="Registry" value={`${regReadiness}%`} accent={regReadiness === 100 ? 'green' : 'amber'} hint={registry?.status || 'draft'} />
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-stone-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium capitalize transition-colors ${
              tab === t ? 'border-rose-500 text-rose-300' : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 'classification' && (
        <div className="space-y-4">
          {!classification ? (
            <EmptyState
              title="Not classified yet"
              description="Run the deterministic classifier to determine this system's risk tier and obligations."
              action={<Link href={`/dashboard/systems/${id}/classify`}><Button>Run classifier</Button></Link>}
            />
          ) : (
            <>
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-stone-200">Latest classification</span>
                    <Badge tone={tierTone(classification.tier)}>{classification.tier} risk</Badge>
                    {classification.is_override && <Badge tone="amber">Override</Badge>}
                  </div>
                  <span className="text-xs text-stone-500">{fmtDate(classification.created_at)}</span>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500">Coverage</span>
                    <div className="flex-1"><Bar value={pct(classification.coverage_pct)} /></div>
                    <span className="text-xs text-stone-400">{pct(classification.coverage_pct)}%</span>
                  </div>
                  {classification.is_override && classification.override_justification && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                      Override justification: {classification.override_justification}
                    </p>
                  )}
                  {Array.isArray(classification.rationale) && classification.rationale.length > 0 && (
                    <ul className="space-y-1.5 text-sm text-stone-300">
                      {classification.rationale.map((r: any, i: number) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-rose-400">▸</span>
                          <span>{typeof r === 'string' ? r : r.text || JSON.stringify(r)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>

              <Card>
                <CardHeader><span className="text-sm font-semibold text-stone-200">Cited rule hits ({ruleHits.length})</span></CardHeader>
                <CardBody className="p-0">
                  {ruleHits.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-stone-500">No rule hits recorded.</p>
                  ) : (
                    <Table>
                      <THead>
                        <TR>
                          <TH>Rule</TH>
                          <TH>Article</TH>
                          <TH>Question / Answer</TH>
                          <TH>Tier impact</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {ruleHits.map((h, i) => (
                          <TR key={h.id ?? i}>
                            <TD className="font-mono text-xs text-rose-300">{h.rule_code}</TD>
                            <TD className="text-xs text-stone-400">{h.article_ref}</TD>
                            <TD>
                              <div className="text-stone-200">{h.question}</div>
                              <div className="text-xs text-stone-500">→ {String(h.answer)}</div>
                            </TD>
                            <TD>{h.contributes_to_tier ? <Badge tone="amber">{h.contributes_to_tier}</Badge> : <span className="text-xs text-stone-600">—</span>}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  )}
                </CardBody>
              </Card>
            </>
          )}
        </div>
      )}

      {tab === 'obligations' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-200">Obligations ({obligations.length})</span>
            <Link href="/dashboard/obligations" className="text-xs text-rose-400 hover:text-rose-300">Open registry →</Link>
          </CardHeader>
          <CardBody className="p-0">
            {obligations.length === 0 ? (
              <p className="px-5 py-6 text-sm text-stone-500">No obligations. Run the classifier to generate them.</p>
            ) : (
              <Table>
                <THead>
                  <TR><TH>Obligation</TH><TH>Article</TH><TH>Owner</TH><TH>Due</TH><TH>Status</TH></TR>
                </THead>
                <TBody>
                  {obligations.map((o) => (
                    <TR key={o.id}>
                      <TD>
                        <div className="font-medium text-stone-100">{o.title}</div>
                        {o.applicability_reason && <div className="text-xs text-stone-500">{o.applicability_reason}</div>}
                      </TD>
                      <TD className="text-xs text-stone-400">{o.article_ref}</TD>
                      <TD className="text-sm text-stone-300">{o.owner || '—'}</TD>
                      <TD className="text-xs text-stone-400">{o.due_date ? fmtDate(o.due_date) : '—'}</TD>
                      <TD><Badge tone={statusTone(o.status)}>{o.status}</Badge></TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'evidence' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="text-sm font-semibold text-stone-200">Evidence readiness</span>
              <span className="text-xs text-stone-500">{evidence?.gap_count ?? reqs.filter((r) => r.status !== 'complete').length} gaps</span>
            </CardHeader>
            <CardBody>
              <div className="flex items-center gap-3">
                <div className="flex-1"><Bar value={evReadiness} tone={evReadiness === 100 ? 'green' : 'amber'} /></div>
                <span className="text-sm font-semibold text-stone-200">{evReadiness}%</span>
              </div>
            </CardBody>
          </Card>
          {reqs.length === 0 ? (
            <EmptyState title="No evidence requirements" description="Requirements are generated when the system is classified." />
          ) : (
            <Table>
              <THead>
                <TR><TH>Requirement</TH><TH>Category</TH><TH>Required</TH><TH>Reviewer</TH><TH>Status</TH></TR>
              </THead>
              <TBody>
                {reqs.map((r) => (
                  <TR key={r.id}>
                    <TD>
                      <div className="font-medium text-stone-100">{r.title}</div>
                      {r.artifact_url && <a href={r.artifact_url} target="_blank" rel="noreferrer" className="text-xs text-rose-400 hover:underline">{r.artifact_url}</a>}
                    </TD>
                    <TD className="text-xs text-stone-400">{r.category}</TD>
                    <TD>{r.required ? <Badge tone="amber">required</Badge> : <Badge tone="slate">optional</Badge>}</TD>
                    <TD className="text-sm text-stone-300">{r.reviewer || '—'}</TD>
                    <TD><Badge tone={statusTone(r.status)}>{r.status}</Badge></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      )}

      {tab === 'registry' && (
        <div className="space-y-4">
          {!registry ? (
            <EmptyState title="No registry package" description="A draft package is created automatically for high-risk systems." />
          ) : (
            <>
              <Card>
                <CardHeader className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-stone-200">EU database registry package</span>
                    <Badge tone={statusTone(registry.status)}>{registry.status}</Badge>
                  </div>
                  <Link href="/dashboard/registry" className="text-xs text-rose-400 hover:text-rose-300">Open registry →</Link>
                </CardHeader>
                <CardBody className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500">Readiness</span>
                    <div className="flex-1"><Bar value={regReadiness} tone={regReadiness === 100 ? 'green' : 'amber'} /></div>
                    <span className="text-xs text-stone-400">{regReadiness}%</span>
                  </div>
                  {registry.registered_reference && (
                    <div className="text-sm text-stone-300">Reference: <span className="font-mono text-rose-300">{registry.registered_reference}</span></div>
                  )}
                  {Array.isArray(registry.blocking_reasons) && registry.blocking_reasons.length > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-300">Blocking reasons</div>
                      <ul className="space-y-1 text-sm text-red-200">
                        {registry.blocking_reasons.map((b: any, i: number) => (
                          <li key={i} className="flex gap-2"><span>✕</span><span>{typeof b === 'string' ? b : JSON.stringify(b)}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardBody>
              </Card>
              {registry.fields && (
                <Card>
                  <CardHeader><span className="text-sm font-semibold text-stone-200">Package fields</span></CardHeader>
                  <CardBody className="p-0">
                    <Table>
                      <THead><TR><TH>Field</TH><TH>Value</TH></TR></THead>
                      <TBody>
                        {Object.entries(registry.fields).map(([k, v]) => (
                          <TR key={k}>
                            <TD className="font-mono text-xs text-stone-400">{k}</TD>
                            <TD className="text-stone-200">{v === null || v === '' ? <span className="text-xs text-stone-600">empty</span> : String(typeof v === 'object' ? JSON.stringify(v) : v)}</TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {tab === 'roles' && (
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="text-sm font-semibold text-stone-200">Role-change log ({roleEvents.length})</span>
            <Link href="/dashboard/roles" className="text-xs text-rose-400 hover:text-rose-300">Open roles →</Link>
          </CardHeader>
          <CardBody className="p-0">
            {roleEvents.length === 0 ? (
              <p className="px-5 py-6 text-sm text-stone-500">No role events recorded.</p>
            ) : (
              <Table>
                <THead><TR><TH>Event</TH><TH>Role change</TH><TH>Flip</TH><TH>When</TH></TR></THead>
                <TBody>
                  {roleEvents.map((e) => (
                    <TR key={e.id}>
                      <TD>
                        <div className="font-medium text-stone-100">{e.event_type}</div>
                        {e.description && <div className="text-xs text-stone-500">{e.description}</div>}
                      </TD>
                      <TD className="text-sm text-stone-300">{e.before_role || '—'} → {e.after_role || '—'}</TD>
                      <TD>{e.flipped ? <Badge tone="amber">flipped</Badge> : <span className="text-xs text-stone-600">no</span>}</TD>
                      <TD className="text-xs text-stone-400">{fmtDate(e.created_at)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'versions' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><span className="text-sm font-semibold text-stone-200">Intake snapshots ({versions.length})</span></CardHeader>
            <CardBody className="p-0">
              {versions.length === 0 ? (
                <p className="px-5 py-6 text-sm text-stone-500">No version snapshots.</p>
              ) : (
                <ol className="divide-y divide-stone-800">
                  {versions.map((v, i) => (
                    <li key={v.id ?? i} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-200">Snapshot #{versions.length - i}</span>
                        <span className="text-xs text-stone-500">{fmtDate(v.created_at)}</span>
                      </div>
                      <div className="text-xs text-stone-500">by {v.created_by || 'system'}</div>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader><span className="text-sm font-semibold text-stone-200">Activity timeline ({activity.length})</span></CardHeader>
            <CardBody className="p-0">
              {activity.length === 0 ? (
                <p className="px-5 py-6 text-sm text-stone-500">No recorded activity.</p>
              ) : (
                <ol className="divide-y divide-stone-800">
                  {activity.map((a, i) => (
                    <li key={a.id ?? i} className="px-5 py-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-stone-200">{a.action}</span>
                        <span className="text-xs text-stone-500">{fmtDate(a.created_at)}</span>
                      </div>
                      {a.summary && <div className="text-xs text-stone-400">{a.summary}</div>}
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      )}

      {/* Edit modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit system"
        className="max-w-2xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={saveEdit} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
          </>
        }
      >
        <div className="grid max-h-[60vh] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2">
            <input className={inputCls} value={editForm.name || ''} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
          </Field>
          <Field label="Description" className="sm:col-span-2">
            <textarea className={inputCls} rows={3} value={editForm.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
          </Field>
          <Field label="Intended purpose" className="sm:col-span-2">
            <textarea className={inputCls} rows={2} value={editForm.intended_purpose || ''} onChange={(e) => setEditForm({ ...editForm, intended_purpose: e.target.value })} />
          </Field>
          <Field label="Purpose category">
            <input className={inputCls} value={editForm.purpose_category || ''} onChange={(e) => setEditForm({ ...editForm, purpose_category: e.target.value })} />
          </Field>
          <Field label="Role">
            <select className={inputCls} value={editForm.role || ''} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}>
              <option value="">—</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
          <Field label="Modality">
            <input className={inputCls} value={editForm.modality || ''} onChange={(e) => setEditForm({ ...editForm, modality: e.target.value })} />
          </Field>
          <Field label="Lifecycle stage">
            <input className={inputCls} value={editForm.lifecycle_stage || ''} onChange={(e) => setEditForm({ ...editForm, lifecycle_stage: e.target.value })} />
          </Field>
          <Field label="Status">
            <select className={inputCls} value={editForm.status || ''} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              <option value="">—</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Check label="Placed on EU market" checked={!!editForm.placed_on_eu_market} onChange={(v) => setEditForm({ ...editForm, placed_on_eu_market: v })} />
            <Check label="General-purpose AI (GPAI)" checked={!!editForm.is_gpai} onChange={(v) => setEditForm({ ...editForm, is_gpai: v })} />
            <Check label="Systemic risk" checked={!!editForm.is_systemic_risk} onChange={(v) => setEditForm({ ...editForm, is_systemic_risk: v })} />
          </div>
        </div>
      </Modal>

      {/* Tags modal */}
      <Modal
        open={tagsOpen}
        onClose={() => setTagsOpen(false)}
        title="Edit tags"
        footer={
          <>
            <Button variant="secondary" onClick={() => setTagsOpen(false)}>Cancel</Button>
            <Button onClick={saveTags} disabled={savingTags}>{savingTags ? 'Saving...' : 'Save tags'}</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {tags.length === 0 && <span className="text-xs text-stone-600">No tags yet</span>}
            {tags.map((t) => (
              <button key={t} onClick={() => removeTag(t)} className="inline-flex items-center gap-1 rounded-full border border-stone-700 bg-stone-800 px-2.5 py-0.5 text-xs text-stone-200 hover:border-red-500/40 hover:text-red-300">
                #{t} <span>✕</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="Add a tag and press Enter"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            />
            <Button variant="secondary" onClick={addTag}>Add</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500'

function Field({ label, className = '', children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-stone-500">{label}</span>
      {children}
    </label>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-stone-300">
      <input type="checkbox" className="h-4 w-4 rounded border-stone-700 bg-stone-950 text-rose-500 focus:ring-rose-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  )
}
