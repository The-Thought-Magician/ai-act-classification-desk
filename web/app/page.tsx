import Link from 'next/link'

const features = [
  {
    title: 'AI-System Intake Register',
    body: 'A system-of-record for every AI system you build, buy, or deploy. Capture role (provider, deployer, importer), intended purpose, modality, deployment geography, lifecycle stage, and GPAI / systemic-risk flags, with versioned intake snapshots.',
  },
  {
    title: 'Deterministic Risk-Tier Classifier',
    body: 'A versioned decision tree over Article 5 prohibited practices, the Annex III high-risk catalog, the Article 6(3) derogation, and Article 50 transparency triggers. Same answers, same tier, every rule hit cited to an Act article.',
  },
  {
    title: 'Per-Tier Obligation Generator',
    body: 'Derive the statutory checklist from the tier: risk management (Art 9) through registration (Art 49), deployer duties (Art 26), and Article 50 transparency. Auto-regenerates when tier or role changes.',
  },
  {
    title: 'Conformity-Evidence Tracker',
    body: 'Map the Annex IV technical-documentation catalog to artifacts, track approval status, reuse evidence across systems, and watch a readiness percentage and gap score per system.',
  },
  {
    title: 'Transparency-Notice Builder',
    body: 'Generate versioned, publishable end-user notices for chatbots, synthetic content, deepfakes, and emotion recognition, with token substitution and plain-text / HTML export.',
  },
  {
    title: 'EU Registry Package Assembler',
    body: 'Assemble the Article 49 / Annex VIII registration package behind a submission-readiness gate: all required fields filled, 100% evidence readiness, and a declaration of conformity on file.',
  },
  {
    title: 'Role-Reasoning Engine',
    body: 'Detect substantial modifications and fine-tunes that flip a deployer into a provider under Article 25, re-derive the effective role, and regenerate obligations automatically.',
  },
  {
    title: 'Portfolio Dashboard & Analytics',
    body: 'Tier distribution, obligation completion, evidence gaps, registry status, upcoming deadlines, readiness trends, and top blocking requirements across your whole portfolio.',
  },
]

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-amber-500 text-sm font-black text-white">AI</span>
          <span className="text-lg font-black">AiActClassification<span className="text-indigo-400">Desk</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="text-sm text-slate-300 hover:text-white">Pricing</Link>
          <Link href="/auth/sign-in" className="text-sm text-slate-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          Deterministic EU AI Act legal engine
        </span>
        <h1 className="mt-6 text-4xl font-black leading-tight sm:text-6xl">
          Classify every AI system into its <span className="text-indigo-400">EU AI Act</span> risk tier
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400">
          Turn 100 pages of legal text into an operational, system-by-system compliance engine. Defensible risk-tier
          classifications with a cited rationale, the tier-specific obligation checklist, Annex IV evidence tracking, and
          the EU registration package, all from one intake.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/auth/sign-up" className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-500">
            Start classifying free
          </Link>
          <Link href="/auth/sign-in" className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-base font-semibold text-slate-200 hover:bg-slate-800">
            Sign In
          </Link>
        </div>
        <p className="mt-4 text-xs text-slate-500">Every feature free for signed-in users. No probabilistic model in the classification path.</p>
      </section>

      {/* Problem */}
      <section className="border-y border-slate-800 bg-slate-900/30 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Three problems every EU AI deployer faces</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="text-3xl font-black text-indigo-400">01</div>
              <h3 className="mt-3 text-lg font-semibold">Can&apos;t reliably classify the tier</h3>
              <p className="mt-2 text-sm text-slate-400">The risk taxonomy is scattered across Article 5, Annex III, Article 50, and a web of recitals and exemptions. Mapping a real product to a tier means reading legal text and reasoning about edge cases like the Article 6(3) derogation.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="text-3xl font-black text-amber-400">02</div>
              <h3 className="mt-3 text-lg font-semibold">Can&apos;t produce the obligations</h3>
              <p className="mt-2 text-sm text-slate-400">High-risk systems trigger risk management, data governance, technical documentation, logging, human oversight, and more. Knowing exactly which obligations apply, to whom, and by when is non-obvious.</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <div className="text-3xl font-black text-indigo-400">03</div>
              <h3 className="mt-3 text-lg font-semibold">Can&apos;t assemble the package</h3>
              <p className="mt-2 text-sm text-slate-400">Providers must prepare Annex IV documentation, run a conformity assessment, draw up a declaration of conformity, affix CE marking, and register in the EU database. Today that lives in a fragile spreadsheet.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">One workbench, the whole Act</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-slate-400">From intake to EU-database registration, every step is deterministic and traceable to an article.</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-800 bg-slate-900/60 p-6">
              <h3 className="text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-slate-800 bg-gradient-to-b from-slate-900/40 to-slate-950 px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black sm:text-4xl">Answer &quot;are we ready?&quot; with confidence</h2>
          <p className="mt-4 text-lg text-slate-400">Register your first system, run the deterministic classifier, and get the cited rationale plus the obligation checklist in minutes.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth/sign-up" className="rounded-lg bg-indigo-600 px-6 py-3 text-base font-semibold text-white hover:bg-indigo-500">
              Create your account
            </Link>
            <Link href="/pricing" className="rounded-lg border border-slate-700 bg-slate-900 px-6 py-3 text-base font-semibold text-slate-200 hover:bg-slate-800">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-800 px-6 py-10 text-center text-sm text-slate-600">
        <p className="font-semibold text-slate-400">AiActClassificationDesk</p>
        <p className="mt-1">A deterministic EU AI Act classification and compliance workbench. Not legal advice.</p>
      </footer>
    </main>
  )
}
