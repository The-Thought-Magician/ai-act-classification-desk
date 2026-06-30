'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'

interface Tag {
  id: string
  name: string
  color?: string
}

const ROLES = [
  { value: 'provider', label: 'Provider' },
  { value: 'deployer', label: 'Deployer' },
  { value: 'importer', label: 'Importer' },
  { value: 'distributor', label: 'Distributor' },
  { value: 'product_manufacturer', label: 'Product manufacturer' },
]

const MODALITIES = [
  { value: 'computer_vision', label: 'Computer vision' },
  { value: 'nlp', label: 'NLP / LLM' },
  { value: 'tabular', label: 'Tabular / scoring' },
  { value: 'biometrics', label: 'Biometrics' },
  { value: 'recommendation', label: 'Recommendation' },
  { value: 'robotics', label: 'Robotics' },
  { value: 'multimodal', label: 'Multimodal' },
  { value: 'other', label: 'Other' },
]

const LIFECYCLE = [
  { value: 'concept', label: 'Concept' },
  { value: 'development', label: 'Development' },
  { value: 'testing', label: 'Testing' },
  { value: 'market-placement', label: 'Market placement' },
  { value: 'in-service', label: 'In service' },
  { value: 'withdrawn', label: 'Withdrawn' },
]

const PURPOSE_CATEGORIES = [
  { value: '', label: 'Not assessed yet' },
  { value: 'biometrics', label: 'Biometrics' },
  { value: 'critical_infrastructure', label: 'Critical infrastructure' },
  { value: 'education', label: 'Education & vocational training' },
  { value: 'employment', label: 'Employment & worker management' },
  { value: 'essential_services', label: 'Access to essential services' },
  { value: 'law_enforcement', label: 'Law enforcement' },
  { value: 'migration', label: 'Migration / asylum / border' },
  { value: 'justice', label: 'Justice & democratic process' },
  { value: 'general', label: 'General / non-Annex III' },
]

// EU/EEA + a couple of common non-EU markers for the geography picker.
const GEOGRAPHIES = [
  'Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czechia', 'Denmark',
  'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland',
  'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland',
  'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden',
  'Iceland', 'Liechtenstein', 'Norway', 'Non-EU',
]

const labelCls = 'block text-sm font-medium text-slate-300'
const inputCls =
  'mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:outline-none'

export default function NewSystemPage() {
  const router = useRouter()
  const [tags, setTags] = useState<Tag[]>([])

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [role, setRole] = useState('provider')
  const [intendedPurpose, setIntendedPurpose] = useState('')
  const [purposeCategory, setPurposeCategory] = useState('')
  const [modality, setModality] = useState('other')
  const [lifecycleStage, setLifecycleStage] = useState('concept')
  const [placedOnEuMarket, setPlacedOnEuMarket] = useState(true)
  const [isGpai, setIsGpai] = useState(false)
  const [isSystemicRisk, setIsSystemicRisk] = useState(false)
  const [geographies, setGeographies] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    api
      .listTags()
      .then((t) => active && setTags(Array.isArray(t) ? (t as Tag[]) : []))
      .catch(() => {
        /* tags are optional for intake; ignore load failures */
      })
    return () => {
      active = false
    }
  }, [])

  const toggleGeography = (g: string) => {
    setGeographies((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
  }

  const toggleTag = (name: string) => {
    setSelectedTags((prev) => (prev.includes(name) ? prev.filter((x) => x !== name) : [...prev, name]))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('A system name is required.')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const created = await api.createSystem({
        name: name.trim(),
        description: description.trim(),
        role,
        intended_purpose: intendedPurpose.trim(),
        purpose_category: purposeCategory,
        modality,
        lifecycle_stage: lifecycleStage,
        placed_on_eu_market: placedOnEuMarket,
        is_gpai: isGpai,
        is_systemic_risk: isSystemicRisk,
        geographies,
        tags: selectedTags,
        status: 'draft',
      })
      const id = (created as { id?: string })?.id
      if (id) router.push(`/dashboard/systems/${id}/classify`)
      else router.push('/dashboard/systems')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create the system.')
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/dashboard/systems" className="text-xs text-slate-500 hover:text-slate-300">
          ← Back to register
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-white">Register an AI System</h1>
        <p className="mt-1 text-sm text-slate-400">
          Capture the intake record. After saving you will run the deterministic classifier to derive
          the risk tier, obligations, and evidence requirements.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        {/* Identity */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-200">Identity</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <label className={labelCls} htmlFor="name">
                System name <span className="text-red-400">*</span>
              </label>
              <input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Resume-screening model"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="description">
                Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What the system does and where it sits in your stack."
                rows={3}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls} htmlFor="purpose">
                Intended purpose
              </label>
              <textarea
                id="purpose"
                value={intendedPurpose}
                onChange={(e) => setIntendedPurpose(e.target.value)}
                placeholder="The specific use the system is intended for (drives the Annex III screen)."
                rows={2}
                className={inputCls}
              />
            </div>
          </CardBody>
        </Card>

        {/* Classification context */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-200">Classification Context</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelCls} htmlFor="role">
                  Your role under the Act
                </label>
                <select id="role" value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="modality">
                  Modality
                </label>
                <select
                  id="modality"
                  value={modality}
                  onChange={(e) => setModality(e.target.value)}
                  className={inputCls}
                >
                  {MODALITIES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="purpose_category">
                  Purpose category
                </label>
                <select
                  id="purpose_category"
                  value={purposeCategory}
                  onChange={(e) => setPurposeCategory(e.target.value)}
                  className={inputCls}
                >
                  {PURPOSE_CATEGORIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls} htmlFor="lifecycle">
                  Lifecycle stage
                </label>
                <select
                  id="lifecycle"
                  value={lifecycleStage}
                  onChange={(e) => setLifecycleStage(e.target.value)}
                  className={inputCls}
                >
                  {LIFECYCLE.map((l) => (
                    <option key={l.value} value={l.value}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={placedOnEuMarket}
                  onChange={(e) => setPlacedOnEuMarket(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
                />
                Placed on the EU market or put into service in the EU
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isGpai}
                  onChange={(e) => setIsGpai(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
                />
                General-purpose AI (GPAI) model
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={isSystemicRisk}
                  onChange={(e) => setIsSystemicRisk(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-600 bg-slate-800 accent-indigo-500"
                  disabled={!isGpai}
                />
                Systemic-risk GPAI (Art 51)
                {!isGpai && <span className="text-xs text-slate-500">— GPAI only</span>}
              </label>
            </div>
          </CardBody>
        </Card>

        {/* Geographies */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">Deployment Geography</h2>
            <span className="text-xs text-slate-500">{geographies.length} selected</span>
          </CardHeader>
          <CardBody>
            <div className="flex flex-wrap gap-2">
              {GEOGRAPHIES.map((g) => {
                const on = geographies.includes(g)
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGeography(g)}
                    className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                      on
                        ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                        : 'border-slate-700 bg-slate-800/50 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {g}
                  </button>
                )
              })}
            </div>
          </CardBody>
        </Card>

        {/* Tags */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-slate-200">Tags</h2>
          </CardHeader>
          <CardBody>
            {tags.length === 0 ? (
              <p className="text-sm text-slate-500">
                No tags yet. Create them under{' '}
                <Link href="/dashboard/tags" className="text-indigo-400 hover:text-indigo-300">
                  Tags &amp; Filters
                </Link>
                .
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((t) => {
                  const on = selectedTags.includes(t.name)
                  return (
                    <button key={t.id} type="button" onClick={() => toggleTag(t.name)}>
                      <Badge tone={on ? 'indigo' : 'slate'}>
                        {on ? '✓ ' : ''}
                        {t.name}
                      </Badge>
                    </button>
                  )
                })}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Link href="/dashboard/systems">
            <Button variant="ghost" type="button">
              Cancel
            </Button>
          </Link>
          <Button type="submit" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating...' : 'Create & classify'}
          </Button>
        </div>
      </form>
    </div>
  )
}
