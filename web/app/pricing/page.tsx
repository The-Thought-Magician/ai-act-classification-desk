'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'

const freeFeatures = [
  'Unlimited AI-system intake records',
  'Deterministic risk-tier classifier with cited rationale',
  'Per-tier statutory obligation generator',
  'Annex IV conformity-evidence tracker & readiness score',
  'Transparency-notice builder (versioned, exportable)',
  'EU registry package assembler with submission gate',
  'Role-reasoning engine (deployer to provider flips)',
  'Portfolio dashboard, analytics, deadlines & search',
  'Tags, saved filters, bulk actions',
  'Webhooks, API keys & audit log',
]

export default function Pricing() {
  const [stripeEnabled, setStripeEnabled] = useState(false)
  const [planName, setPlanName] = useState<string | null>(null)
  const [checkoutError, setCheckoutError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.getBillingPlan()
      .then((res) => {
        setStripeEnabled(Boolean(res?.stripeEnabled))
        setPlanName(res?.plan?.name ?? null)
      })
      .catch(() => { /* unauthenticated visitors just see the static plans */ })
  }, [])

  const upgrade = async () => {
    setCheckoutError('')
    setBusy(true)
    try {
      const res = await api.startCheckout()
      if (res?.url) { window.location.href = res.url; return }
      setCheckoutError('Checkout is not available right now.')
    } catch {
      setCheckoutError('Billing is not configured. Every feature is already free, so there is nothing to upgrade.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="min-h-screen bg-stone-950 text-white">
      <nav className="border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 text-sm font-black text-white">AI</span>
          <span className="text-lg font-black">AiActClassification<span className="text-rose-400">Desk</span></span>
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/auth/sign-in" className="text-sm text-stone-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500">Get Started</Link>
        </div>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-20 text-center">
        <h1 className="text-4xl font-black sm:text-5xl">Simple, honest pricing</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-stone-400">
          Every feature is free for signed-in users. The Pro tier exists for organizations that want a billing
          relationship and priority support, but it unlocks nothing the free plan lacks.
        </p>

        <div className="mt-14 grid gap-6 md:grid-cols-2">
          {/* Free */}
          <div className="rounded-2xl border border-rose-500/40 bg-stone-900/60 p-8 text-left ring-1 ring-rose-500/20">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Free</h2>
              <span className="rounded-full border border-green-500/30 bg-green-500/15 px-3 py-1 text-xs font-medium text-green-300">Current plan</span>
            </div>
            <div className="mt-4 text-4xl font-black">€0<span className="text-base font-medium text-stone-500">/month</span></div>
            <p className="mt-2 text-sm text-stone-400">Full access to the entire compliance workbench.</p>
            <ul className="mt-6 space-y-2 text-sm text-stone-300">
              {freeFeatures.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <span className="mt-0.5 text-green-400">✓</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Link href="/auth/sign-up" className="mt-8 block rounded-lg bg-rose-600 px-6 py-3 text-center font-semibold text-white hover:bg-rose-500">
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div className="rounded-2xl border border-stone-800 bg-stone-900/60 p-8 text-left">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Pro</h2>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">Optional</span>
            </div>
            <div className="mt-4 text-4xl font-black">€49<span className="text-base font-medium text-stone-500">/month</span></div>
            <p className="mt-2 text-sm text-stone-400">Everything in Free, plus a billing relationship and priority support. No additional feature gates.</p>
            <ul className="mt-6 space-y-2 text-sm text-stone-300">
              <li className="flex items-start gap-2"><span className="mt-0.5 text-amber-400">★</span><span>Everything in the Free plan</span></li>
              <li className="flex items-start gap-2"><span className="mt-0.5 text-amber-400">★</span><span>Priority email support</span></li>
              <li className="flex items-start gap-2"><span className="mt-0.5 text-amber-400">★</span><span>Invoiced billing for procurement</span></li>
            </ul>
            <button
              onClick={upgrade}
              disabled={busy || !stripeEnabled}
              className="mt-8 block w-full rounded-lg border border-stone-700 bg-stone-800 px-6 py-3 text-center font-semibold text-stone-200 hover:bg-stone-700 disabled:opacity-50"
            >
              {busy ? 'Starting checkout...' : stripeEnabled ? 'Upgrade to Pro' : 'Billing not configured'}
            </button>
            {!stripeEnabled && (
              <p className="mt-3 text-center text-xs text-stone-500">Stripe is not configured, so checkout is disabled. All features remain free.</p>
            )}
            {checkoutError && <p className="mt-3 text-center text-xs text-amber-300">{checkoutError}</p>}
          </div>
        </div>

        {planName && (
          <p className="mt-8 text-sm text-stone-500">You are currently on the <span className="font-medium text-stone-300">{planName}</span> plan.</p>
        )}
      </section>

      <footer className="border-t border-stone-800 px-6 py-10 text-center text-sm text-stone-600">
        <p className="font-semibold text-stone-400">AiActClassificationDesk</p>
        <p className="mt-1">A deterministic EU AI Act classification and compliance workbench. Not legal advice.</p>
      </footer>
    </main>
  )
}
