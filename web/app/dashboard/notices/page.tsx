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

interface TransparencyNotice {
  id: string
  system_id: string
  user_id: string
  trigger_code: string
  locale: string
  version: number
  body: string
  body_html?: string | null
  published: boolean
  created_by?: string
  created_at?: string
}

interface NoticeTemplate {
  trigger_code: string
  title?: string
  name?: string
  description?: string
  locale?: string
  body?: string
  tokens?: string[]
}

interface AiSystem {
  id: string
  name: string
  current_tier?: string
  role?: string
}

function inputCls(extra = '') {
  return `w-full rounded-lg border border-stone-700 bg-stone-950/60 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 focus:border-rose-500 focus:outline-none focus:ring-1 focus:ring-rose-500 ${extra}`
}

// Extract {{token}} placeholders from a template body.
function extractTokens(body: string, declared?: string[]): string[] {
  const set = new Set<string>(declared ?? [])
  const re = /\{\{\s*([\w.-]+)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body))) set.add(m[1])
  return Array.from(set)
}

// Replace {{token}} placeholders with provided values for live preview.
function renderTokens(body: string, tokens: Record<string, string>): string {
  return body.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_, k) => tokens[k] ?? `{{${k}}}`)
}

export default function NoticesPage() {
  const [notices, setNotices] = useState<TransparencyNotice[]>([])
  const [templates, setTemplates] = useState<NoticeTemplate[]>([])
  const [systems, setSystems] = useState<AiSystem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [systemFilter, setSystemFilter] = useState('')
  const [publishedFilter, setPublishedFilter] = useState('')
  const [search, setSearch] = useState('')

  // builder state
  const [builderOpen, setBuilderOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [bSystemId, setBSystemId] = useState('')
  const [bTemplate, setBTemplate] = useState('')
  const [bLocale, setBLocale] = useState('en')
  const [bBody, setBBody] = useState('')
  const [bTokens, setBTokens] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  // detail / preview
  const [preview, setPreview] = useState<TransparencyNotice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [n, t, s] = await Promise.all([
        api.listNotices(),
        api.listNoticeTemplates(),
        api.listSystems(),
      ])
      setNotices(Array.isArray(n) ? n : [])
      setTemplates(Array.isArray(t) ? t : [])
      setSystems(Array.isArray(s) ? s : [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notices')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const systemName = useCallback(
    (id: string) => systems.find((s) => s.id === id)?.name ?? id,
    [systems],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return notices.filter((n) => {
      if (systemFilter && n.system_id !== systemFilter) return false
      if (publishedFilter === 'published' && !n.published) return false
      if (publishedFilter === 'draft' && n.published) return false
      if (q) {
        const hay = `${n.trigger_code} ${n.locale} ${systemName(n.system_id)} ${n.body}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [notices, systemFilter, publishedFilter, search, systemName])

  const stats = useMemo(() => {
    const published = notices.filter((n) => n.published).length
    return {
      total: notices.length,
      published,
      drafts: notices.length - published,
      systems: new Set(notices.map((n) => n.system_id)).size,
    }
  }, [notices])

  function selectTemplate(code: string) {
    setBTemplate(code)
    const tpl = templates.find((t) => t.trigger_code === code)
    if (tpl) {
      setBBody(tpl.body ?? '')
      if (tpl.locale) setBLocale(tpl.locale)
      const toks = extractTokens(tpl.body ?? '', tpl.tokens)
      const next: Record<string, string> = {}
      toks.forEach((k) => (next[k] = bTokens[k] ?? ''))
      setBTokens(next)
    }
  }

  function openCreate() {
    setEditingId(null)
    setBSystemId(systems[0]?.id ?? '')
    setBTemplate('')
    setBLocale('en')
    setBBody('')
    setBTokens({})
    setBuilderOpen(true)
  }

  async function openEdit(id: string) {
    setError(null)
    try {
      const n: TransparencyNotice = await api.getNotice(id)
      setEditingId(n.id)
      setBSystemId(n.system_id)
      setBTemplate(n.trigger_code)
      setBLocale(n.locale)
      setBBody(n.body)
      const toks = extractTokens(n.body)
      const next: Record<string, string> = {}
      toks.forEach((k) => (next[k] = ''))
      setBTokens(next)
      setBuilderOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notice')
    }
  }

  const bodyTokens = useMemo(() => extractTokens(bBody), [bBody])
  const previewBody = useMemo(() => renderTokens(bBody, bTokens), [bBody, bTokens])

  async function saveNotice() {
    if (!bSystemId || !bBody.trim()) {
      setError('Pick a system and provide notice body text.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const payload = {
        system_id: bSystemId,
        trigger_code: bTemplate || 'custom',
        locale: bLocale,
        body: bBody,
        tokens: bTokens,
      }
      if (editingId) {
        // Editing creates a new version server-side; refresh to reflect it.
        await api.updateNotice(editingId, payload)
      } else {
        await api.createNotice(payload)
      }
      setBuilderOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save notice')
    } finally {
      setSaving(false)
    }
  }

  async function togglePublish(n: TransparencyNotice) {
    setRowBusy(n.id)
    setError(null)
    try {
      const updated = await api.publishNotice(n.id, !n.published)
      setNotices((prev) => prev.map((x) => (x.id === updated.id ? { ...x, ...updated } : x)))
      if (preview && preview.id === n.id) setPreview({ ...preview, ...updated })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change publish state')
    } finally {
      setRowBusy(null)
    }
  }

  if (loading) return <PageSpinner label="Loading transparency notices..." />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Transparency Notices</h1>
          <p className="mt-1 text-sm text-stone-400">
            Article 50 end-user disclosures: build, version, preview and publish.
          </p>
        </div>
        <Button onClick={openCreate}>+ New Notice</Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Notices" value={stats.total} accent="indigo" />
        <Stat label="Published" value={stats.published} accent="green" />
        <Stat label="Drafts" value={stats.drafts} accent="amber" />
        <Stat label="Systems Covered" value={stats.systems} accent="slate" />
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            className={inputCls()}
            placeholder="Search notices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className={inputCls()} value={systemFilter} onChange={(e) => setSystemFilter(e.target.value)}>
            <option value="">All systems</option>
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            className={inputCls()}
            value={publishedFilter}
            onChange={(e) => setPublishedFilter(e.target.value)}
          >
            <option value="">All states</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </CardBody>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="No transparency notices"
          description="Limited-risk (Article 50) systems require end-user disclosure. Build a notice from a template to get started."
          action={<Button onClick={openCreate}>+ New Notice</Button>}
        />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>System</TH>
              <TH>Trigger</TH>
              <TH>Locale</TH>
              <TH>Version</TH>
              <TH>State</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {filtered.map((n) => (
              <TR key={n.id}>
                <TD className="font-medium text-stone-100">{systemName(n.system_id)}</TD>
                <TD>
                  <Badge tone="indigo">{n.trigger_code}</Badge>
                </TD>
                <TD className="uppercase text-stone-400">{n.locale}</TD>
                <TD className="text-stone-400">v{n.version}</TD>
                <TD>
                  <Badge tone={n.published ? statusTone('published') : statusTone('draft')}>
                    {n.published ? 'published' : 'draft'}
                  </Badge>
                </TD>
                <TD className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" className="px-2 py-1 text-xs" onClick={() => setPreview(n)}>
                      Preview
                    </Button>
                    <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => openEdit(n.id)}>
                      Edit
                    </Button>
                    <Button
                      variant={n.published ? 'ghost' : 'primary'}
                      className="px-2 py-1 text-xs"
                      disabled={rowBusy === n.id}
                      onClick={() => togglePublish(n)}
                    >
                      {n.published ? 'Unpublish' : 'Publish'}
                    </Button>
                  </div>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}

      {/* Builder modal with live preview */}
      <Modal
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        title={editingId ? 'Edit notice (creates new version)' : 'Build transparency notice'}
        className="max-w-3xl"
        footer={
          <>
            <Button variant="ghost" onClick={() => setBuilderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={saveNotice} disabled={saving}>
              {saving ? 'Saving...' : editingId ? 'Save new version' : 'Create notice'}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">System</label>
              <select className={inputCls()} value={bSystemId} onChange={(e) => setBSystemId(e.target.value)}>
                <option value="">Select system...</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Template / trigger</label>
              <select className={inputCls()} value={bTemplate} onChange={(e) => selectTemplate(e.target.value)}>
                <option value="">Custom (no template)</option>
                {templates.map((t) => (
                  <option key={t.trigger_code} value={t.trigger_code}>
                    {t.title ?? t.name ?? t.trigger_code}
                  </option>
                ))}
              </select>
              {bTemplate && (
                <p className="mt-1 text-xs text-stone-500">
                  {templates.find((t) => t.trigger_code === bTemplate)?.description}
                </p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Locale</label>
              <input className={inputCls()} value={bLocale} onChange={(e) => setBLocale(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-stone-400">Body</label>
              <textarea
                className={inputCls('min-h-[140px] font-mono text-xs')}
                placeholder="Notice text. Use {{token}} placeholders for substitution."
                value={bBody}
                onChange={(e) => setBBody(e.target.value)}
              />
            </div>
            {bodyTokens.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-stone-400">Tokens</div>
                {bodyTokens.map((k) => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-32 truncate font-mono text-xs text-amber-300">{k}</span>
                    <input
                      className={inputCls('flex-1')}
                      placeholder={`value for ${k}`}
                      value={bTokens[k] ?? ''}
                      onChange={(e) => setBTokens((p) => ({ ...p, [k]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-stone-400">Live preview</label>
            <div className="min-h-[200px] whitespace-pre-wrap rounded-lg border border-stone-800 bg-stone-950/60 p-4 text-sm text-stone-200">
              {previewBody.trim() ? previewBody : <span className="text-stone-600">Preview appears here...</span>}
            </div>
          </div>
        </div>
      </Modal>

      {/* Preview existing notice */}
      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? `${preview.trigger_code} · v${preview.version}` : 'Notice'}
        className="max-w-2xl"
        footer={
          preview && (
            <>
              <Button variant="secondary" onClick={() => { const id = preview.id; setPreview(null); openEdit(id) }}>
                Edit
              </Button>
              <Button
                variant={preview.published ? 'ghost' : 'primary'}
                disabled={rowBusy === preview.id}
                onClick={() => togglePublish(preview)}
              >
                {preview.published ? 'Unpublish' : 'Publish'}
              </Button>
            </>
          )
        }
      >
        {preview && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-stone-400">
              <Badge tone="indigo">{systemName(preview.system_id)}</Badge>
              <Badge tone="slate">{preview.locale.toUpperCase()}</Badge>
              <Badge tone={preview.published ? statusTone('published') : statusTone('draft')}>
                {preview.published ? 'published' : 'draft'}
              </Badge>
            </div>
            {preview.body_html ? (
              <div
                className="prose prose-invert max-w-none text-sm text-stone-200"
                dangerouslySetInnerHTML={{ __html: preview.body_html }}
              />
            ) : (
              <div className="whitespace-pre-wrap rounded-lg border border-stone-800 bg-stone-950/60 p-4 text-sm text-stone-200">
                {preview.body}
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
