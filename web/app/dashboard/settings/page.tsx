'use client'

import { useEffect, useState } from 'react'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge, statusTone } from '@/components/ui/Badge'
import { Stat } from '@/components/ui/Stat'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/Spinner'

interface NotificationPrefs {
  deadline_reminders?: boolean
  classification_changes?: boolean
  role_flips?: boolean
  weekly_digest?: boolean
}

interface Settings {
  org_name?: string
  default_jurisdiction?: string
  default_role?: string
  contact_email?: string
  notification_prefs?: NotificationPrefs
  [key: string]: unknown
}

interface Plan {
  id?: string
  name?: string
  price_cents?: number
}

interface Subscription {
  plan_id?: string
  status?: string
  current_period_end?: string | null
  stripe_customer_id?: string | null
}

interface BillingPlan {
  subscription?: Subscription
  plan?: Plan
  stripeEnabled?: boolean
}

const JURISDICTIONS = ['EU', 'EU + EEA', 'Germany', 'France', 'Netherlands', 'Ireland', 'Spain', 'Italy', 'Global']
const ROLES = ['provider', 'deployer', 'importer', 'distributor', 'authorised_representative']

const PREF_LABELS: { key: keyof NotificationPrefs; label: string; hint: string }[] = [
  { key: 'deadline_reminders', label: 'Deadline reminders', hint: 'Alert before obligation and registry deadlines fall due.' },
  { key: 'classification_changes', label: 'Classification changes', hint: 'Notify when a system risk tier changes after a re-run.' },
  { key: 'role_flips', label: 'Role flips', hint: 'Notify when a provider/deployer role change is detected.' },
  { key: 'weekly_digest', label: 'Weekly digest', hint: 'A weekly portfolio compliance summary by email.' },
]

function fmtMoney(cents?: number): string {
  if (cents == null) return 'Free'
  if (cents === 0) return 'Free'
  return `€${(cents / 100).toFixed(2)}/mo`
}

function fmtDate(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [billing, setBilling] = useState<BillingPlan | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // form state
  const [orgName, setOrgName] = useState('')
  const [jurisdiction, setJurisdiction] = useState('')
  const [role, setRole] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [prefs, setPrefs] = useState<NotificationPrefs>({})

  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [resetDone, setResetDone] = useState(false)
  const [billingBusy, setBillingBusy] = useState(false)
  const [billingMsg, setBillingMsg] = useState<string | null>(null)

  function applySettings(s: Settings) {
    setSettings(s)
    setOrgName(s.org_name ?? '')
    setJurisdiction(s.default_jurisdiction ?? '')
    setRole(s.default_role ?? '')
    setContactEmail(s.contact_email ?? '')
    setPrefs(s.notification_prefs ?? {})
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [s, b] = await Promise.all([
        api.getSettings().catch(() => ({})),
        api.getBillingPlan().catch(() => null),
      ])
      applySettings((s ?? {}) as Settings)
      setBilling(b as BillingPlan | null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body: Settings = {
        org_name: orgName,
        default_jurisdiction: jurisdiction,
        default_role: role,
        contact_email: contactEmail,
        notification_prefs: prefs,
      }
      const updated = (await api.updateSettings(body)) as Settings
      applySettings(updated ?? body)
      setSavedAt(Date.now())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  async function doReset() {
    setResetting(true)
    setError(null)
    try {
      await api.resetDemo()
      setResetDone(true)
      setResetOpen(false)
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to reset demo data')
    } finally {
      setResetting(false)
    }
  }

  async function upgrade() {
    setBillingBusy(true)
    setBillingMsg(null)
    try {
      const r = (await api.startCheckout()) as { url?: string }
      if (r?.url) {
        window.location.href = r.url
      } else {
        setBillingMsg('Checkout could not be started.')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Billing unavailable'
      setBillingMsg(msg.includes('503') || msg.toLowerCase().includes('not configured')
        ? 'Billing is not configured in this environment.'
        : msg)
    } finally {
      setBillingBusy(false)
    }
  }

  async function manageBilling() {
    setBillingBusy(true)
    setBillingMsg(null)
    try {
      const r = (await api.openPortal()) as { url?: string }
      if (r?.url) {
        window.location.href = r.url
      } else {
        setBillingMsg('Could not open the billing portal.')
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Billing unavailable'
      setBillingMsg(msg.includes('503') || msg.toLowerCase().includes('not configured')
        ? 'Billing is not configured in this environment.'
        : msg)
    } finally {
      setBillingBusy(false)
    }
  }

  if (loading) return <PageSpinner label="Loading settings..." />

  const planId = billing?.subscription?.plan_id ?? billing?.plan?.id ?? 'free'
  const isPro = planId === 'pro'
  const subStatus = billing?.subscription?.status ?? 'active'

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-1 py-2">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
        <p className="text-sm text-slate-400">
          Workspace defaults, notification preferences, billing, and demo data for your AI Act compliance desk.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}
      {resetDone && (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          Demo data has been re-seeded for your account.
        </div>
      )}

      {/* Organisation + defaults */}
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-slate-100">Workspace</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            These defaults pre-fill new system intake forms and classification jurisdiction scope.
          </p>
        </CardHeader>
        <CardBody>
          <form onSubmit={save} className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Organisation name</span>
                <input
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Acme AI GmbH"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Compliance contact email</span>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="compliance@acme.eu"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Default jurisdiction</span>
                <select
                  value={jurisdiction}
                  onChange={(e) => setJurisdiction(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select jurisdiction…</option>
                  {JURISDICTIONS.map((j) => (
                    <option key={j} value={j}>{j}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-slate-500">Default operator role</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select role…</option>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </label>
            </div>

            <div>
              <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-slate-500">Notification preferences</span>
              <div className="grid gap-2 sm:grid-cols-2">
                {PREF_LABELS.map((p) => (
                  <button
                    type="button"
                    key={p.key}
                    onClick={() => setPrefs((prev) => ({ ...prev, [p.key]: !prev[p.key] }))}
                    className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                      prefs[p.key]
                        ? 'border-indigo-500/50 bg-indigo-500/10'
                        : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                    }`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                        prefs[p.key] ? 'bg-indigo-500' : 'bg-slate-700'
                      }`}
                    >
                      <span className={`h-4 w-4 rounded-full bg-white transition-transform ${prefs[p.key] ? 'translate-x-4' : ''}`} />
                    </span>
                    <span>
                      <span className="block text-sm font-medium text-slate-200">{p.label}</span>
                      <span className="block text-xs text-slate-500">{p.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save settings'}
              </Button>
              {savedAt && !saving && (
                <span className="text-xs text-emerald-400">Saved</span>
              )}
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Billing summary */}
      <Card>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Billing</h2>
            <p className="mt-0.5 text-xs text-slate-400">Current subscription and plan for this workspace.</p>
          </div>
          <Badge tone={isPro ? 'indigo' : 'slate'}>{isPro ? 'Pro' : 'Free'}</Badge>
        </CardHeader>
        <CardBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat
              label="Plan"
              value={billing?.plan?.name ?? (isPro ? 'Pro' : 'Free')}
              accent={isPro ? 'indigo' : 'slate'}
              hint={fmtMoney(billing?.plan?.price_cents)}
            />
            <Stat
              label="Status"
              value={<span className="capitalize">{subStatus}</span>}
              accent={subStatus === 'active' ? 'green' : subStatus === 'canceled' ? 'red' : 'amber'}
            />
            <Stat
              label="Renews / ends"
              value={fmtDate(billing?.subscription?.current_period_end)}
              accent="slate"
            />
          </div>

          {billingMsg && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-300">
              {billingMsg}
            </div>
          )}

          {!billing?.stripeEnabled && (
            <div className="rounded-lg border border-slate-800 bg-slate-950/40 px-4 py-2.5 text-xs text-slate-400">
              Stripe is not enabled in this environment. Upgrade and portal actions are disabled.
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            {!isPro ? (
              <Button onClick={upgrade} disabled={billingBusy || !billing?.stripeEnabled}>
                {billingBusy ? 'Working…' : 'Upgrade to Pro'}
              </Button>
            ) : (
              <Button variant="secondary" onClick={manageBilling} disabled={billingBusy || !billing?.stripeEnabled}>
                {billingBusy ? 'Working…' : 'Manage billing'}
              </Button>
            )}
            <span className="text-xs text-slate-500">
              {isPro ? 'Manage payment method and invoices via the Stripe portal.' : 'Pro unlocks unlimited systems, webhooks, and API keys.'}
            </span>
          </div>
        </CardBody>
      </Card>

      {/* Danger zone — reset demo */}
      <Card className="border-amber-500/30">
        <CardHeader className="border-amber-500/20">
          <h2 className="text-base font-semibold text-amber-300">Demo data</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Re-seed your account with the sample AI system register. This replaces your current data with the demo set.
          </p>
        </CardHeader>
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="danger" onClick={() => setResetOpen(true)} disabled={resetting}>
              Reset demo data
            </Button>
            <span className="text-xs text-slate-500">This action cannot be undone.</span>
          </div>
        </CardBody>
      </Card>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset demo data?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResetOpen(false)} disabled={resetting}>Cancel</Button>
            <Button variant="danger" onClick={doReset} disabled={resetting}>
              {resetting ? 'Resetting…' : 'Yes, reset'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-300">
          This will remove your current systems, classifications, obligations, evidence, and notices, then re-seed the
          demo register. Continue?
        </p>
      </Modal>
    </div>
  )
}
