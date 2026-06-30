'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, statusTone, tierTone } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/Table'

type Any = Record<string, any>

const TIERS = ['prohibited', 'high', 'limited', 'minimal']

function fmtDate(v?: string) {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString()
}

function pct(n?: number) {
  if (n === undefined || n === null) return 0
  return Math.round(n <= 1 ? n * 100 : n)
}

// Normalises a question's options into [{value,label}].
function options(q: Any): { value: string; label: string }[] {
  const raw = q.options || q.choices || (q.type === 'boolean' ? ['yes', 'no'] : null)
  if (!raw) return []
  return raw.map((o: any) =>
    typeof o === 'string' ? { value: o, label: o } : { value: String(o.value ?? o.key ?? o.id), label: String(o.label ?? o.text ?? o.value) },
  )
}

export default function ClassifyPage() {
  const params = useParams()
  const id = String(params?.id ?? '')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [questionnaire, setQuestionnaire] = useState<Any | null>(null)
  const [classification, setClassification] = useState<Any | null>(null)
  const [ruleHits, setRuleHits] = useState<Any[]>([])
  const [history, setHistory] = useState<Any[]>([])

  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [running, setRunning] = useState(false)

  // Override
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideTier, setOverrideTier] = useState('high')
  const [overrideJustification, setOverrideJustification] = useState('')
  const [savingOverride, setSavingOverride] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [q, cls, hist] = await Promise.all([
        api.getQuestionnaire(),
        api.getClassification(id).catch(() => null),
        api.getClassificationHistory(id).catch(() => []),
      ])
      setQuestionnaire(q)
      setClassification(cls?.classification ?? null)
      setRuleHits(Array.isArray(cls?.rule_hits) ? cls.rule_hits : [])
      setHistory(Array.isArray(hist) ? hist : [])
      // Seed answers from prior answers embedded on rule hits if available
      const seed: Record<string, any> = {}
      ;(Array.isArray(cls?.rule_hits) ? cls.rule_hits : []).forEach((h: any) => {
        if (h.question && h.answer !== undefined) seed[h.rule_code] = h.answer
      })
      setAnswers(seed)
    } catch (e: any) {
      setError(e?.message || 'Failed to load questionnaire')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const questions: Any[] = Array.isArray(questionnaire?.questions) ? questionnaire!.questions : []

  const keyOf = (q: Any, i: number) => String(q.key ?? q.id ?? q.code ?? `q${i}`)

  const setAnswer = (k: string, v: any) => setAnswers((a) => ({ ...a, [k]: v }))

  const run = async () => {
    setRunning(true)
    setError(null)
    try {
      const res = await api.runClassification(id, answers)
      setClassification(res?.classification ?? null)
      setRuleHits(Array.isArray(res?.rule_hits) ? res.rule_hits : [])
      const hist = await api.getClassificationHistory(id).catch(() => [])
      setHistory(Array.isArray(hist) ? hist : [])
    } catch (e: any) {
      setError(e?.message || 'Classifier run failed')
    } finally {
      setRunning(false)
    }
  }

  const saveOverride = async () => {
    setSavingOverride(true)
    setError(null)
    try {
      const res = await api.overrideClassification(id, { tier: overrideTier, override_justification: overrideJustification })
      setClassification(res?.classification ?? res ?? null)
      const [cls, hist] = await Promise.all([
        api.getClassification(id).catch(() => null),
        api.getClassificationHistory(id).catch(() => []),
      ])
      if (cls?.classification) {
        setClassification(cls.classification)
        setRuleHits(Array.isArray(cls.rule_hits) ? cls.rule_hits : [])
      }
      setHistory(Array.isArray(hist) ? hist : [])
      setOverrideOpen(false)
    } catch (e: any) {
      setError(e?.message || 'Override failed')
    } finally {
      setSavingOverride(false)
    }
  }

  if (loading) return <PageSpinner label="Loading classifier..." />

  if (error && !questionnaire) {
    return (
      <div className="mx-auto max-w-3xl py-10">
        <EmptyState title="Could not load the classifier" description={error} action={<Button onClick={load}>Retry</Button>} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="mb-1 text-xs text-slate-500">
            <Link href="/dashboard/systems" className="hover:text-indigo-300">AI Systems</Link>
            <span className="px-1.5">/</span>
            <Link href={`/dashboard/systems/${id}`} className="hover:text-indigo-300">Detail</Link>
            <span className="px-1.5">/</span>
            <span className="text-slate-400">Classify</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Risk classifier</h1>
          <p className="mt-1 text-sm text-slate-400">
            Deterministic EU AI Act engine — ruleset <span className="font-mono text-indigo-300">{questionnaire?.ruleset_version || 'n/a'}</span>. Answers walk Article 5, Annex III, Article 6(3) and Article 50.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/systems/${id}`}><Button variant="secondary">Back to system</Button></Link>
          <Button variant="secondary" onClick={() => { setOverrideTier(classification?.tier || 'high'); setOverrideOpen(true) }}>Override tier</Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">{error}</div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Questionnaire */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200">Questionnaire ({questions.length})</span>
              <Button onClick={run} disabled={running || questions.length === 0}>{running ? 'Running...' : 'Run classifier'}</Button>
            </CardHeader>
            <CardBody className="space-y-5">
              {questions.length === 0 ? (
                <EmptyState title="No questions defined" description="The ruleset returned no questionnaire definition." />
              ) : (
                questions.map((q, i) => {
                  const k = keyOf(q, i)
                  const opts = options(q)
                  return (
                    <div key={k} className="border-b border-slate-800/60 pb-4 last:border-0 last:pb-0">
                      <div className="mb-2 flex items-start gap-2">
                        <span className="mt-0.5 text-xs font-mono text-slate-600">{i + 1}.</span>
                        <div>
                          <div className="text-sm font-medium text-slate-100">{q.question || q.text || q.label || k}</div>
                          {q.article_ref && <div className="text-xs text-slate-500">{q.article_ref}</div>}
                          {q.help && <div className="mt-0.5 text-xs text-slate-500">{q.help}</div>}
                        </div>
                      </div>
                      <div className="ml-6">
                        {opts.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {opts.map((o) => {
                              const active = String(answers[k]) === o.value
                              return (
                                <button
                                  key={o.value}
                                  onClick={() => setAnswer(k, o.value)}
                                  className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                                    active
                                      ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
                                      : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                                  }`}
                                >
                                  {o.label}
                                </button>
                              )
                            })}
                          </div>
                        ) : (
                          <input
                            className={inputCls}
                            placeholder="Your answer"
                            value={answers[k] ?? ''}
                            onChange={(e) => setAnswer(k, e.target.value)}
                          />
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </CardBody>
          </Card>
        </div>

        {/* Result + history */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader><span className="text-sm font-semibold text-slate-200">Current result</span></CardHeader>
            <CardBody className="space-y-3">
              {!classification ? (
                <p className="text-sm text-slate-500">No classification yet. Answer the questionnaire and run the classifier.</p>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-bold text-slate-100 capitalize">{classification.tier}</span>
                    <Badge tone={tierTone(classification.tier)}>{classification.tier} risk</Badge>
                    {classification.is_override && <Badge tone="amber">Override</Badge>}
                  </div>
                  <div className="text-xs text-slate-500">
                    Ruleset {classification.ruleset_version} · coverage {pct(classification.coverage_pct)}% · {fmtDate(classification.created_at)}
                  </div>
                  {classification.is_override && classification.override_justification && (
                    <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">{classification.override_justification}</p>
                  )}
                  {Array.isArray(classification.rationale) && classification.rationale.length > 0 && (
                    <ul className="space-y-1 text-sm text-slate-300">
                      {classification.rationale.map((r: any, i: number) => (
                        <li key={i} className="flex gap-2"><span className="text-indigo-400">▸</span><span>{typeof r === 'string' ? r : r.text || JSON.stringify(r)}</span></li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader><span className="text-sm font-semibold text-slate-200">History ({history.length})</span></CardHeader>
            <CardBody className="p-0">
              {history.length === 0 ? (
                <p className="px-5 py-6 text-sm text-slate-500">No prior classifications.</p>
              ) : (
                <ol className="divide-y divide-slate-800">
                  {history.map((h, i) => (
                    <li key={h.id ?? i} className="flex items-center justify-between px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Badge tone={tierTone(h.tier)}>{h.tier}</Badge>
                        {h.is_override && <Badge tone="amber">override</Badge>}
                        <span className="text-xs text-slate-500">{pct(h.coverage_pct)}%</span>
                      </div>
                      <span className="text-xs text-slate-500">{fmtDate(h.created_at)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Rule hits */}
      <Card>
        <CardHeader><span className="text-sm font-semibold text-slate-200">Cited rule hits ({ruleHits.length})</span></CardHeader>
        <CardBody className="p-0">
          {ruleHits.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">Run the classifier to see which articles were triggered.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Rule</TH><TH>Article</TH><TH>Question</TH><TH>Answer</TH><TH>Tier impact</TH></TR>
              </THead>
              <TBody>
                {ruleHits.map((h, i) => (
                  <TR key={h.id ?? i}>
                    <TD className="font-mono text-xs text-indigo-300">{h.rule_code}</TD>
                    <TD className="text-xs text-slate-400">{h.article_ref}</TD>
                    <TD className="text-slate-200">{h.question}</TD>
                    <TD className="text-sm text-slate-300">{String(h.answer)}</TD>
                    <TD>{h.contributes_to_tier ? <Badge tone={tierTone(h.contributes_to_tier)}>{h.contributes_to_tier}</Badge> : <span className="text-xs text-slate-600">—</span>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Override modal */}
      <Modal
        open={overrideOpen}
        onClose={() => setOverrideOpen(false)}
        title="Override risk tier"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOverrideOpen(false)}>Cancel</Button>
            <Button onClick={saveOverride} disabled={savingOverride || !overrideJustification.trim()}>{savingOverride ? 'Saving...' : 'Apply override'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-400">A manual override supersedes the deterministic result. A documented justification is required for audit.</p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Tier</span>
            <div className="flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <button
                  key={t}
                  onClick={() => setOverrideTier(t)}
                  className={`rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                    overrideTier === t ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200' : 'border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">Justification</span>
            <textarea
              className={inputCls}
              rows={4}
              placeholder="Explain why this tier is being overridden..."
              value={overrideJustification}
              onChange={(e) => setOverrideJustification(e.target.value)}
            />
          </label>
        </div>
      </Modal>
    </div>
  )
}

const inputCls =
  'w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'
