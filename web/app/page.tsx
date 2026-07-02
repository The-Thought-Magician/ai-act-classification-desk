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
    <main className="min-h-screen bg-stone-950 text-white">
      <nav className="border-b border-stone-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 text-sm font-black text-white">AI</span>
          <span className="text-lg font-black">AiActClassification<span className="text-rose-400">Desk</span></span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/pricing" className="text-sm text-stone-300 hover:text-white">Pricing</Link>
          <Link href="/auth/sign-in" className="text-sm text-stone-300 hover:text-white">Sign In</Link>
          <Link href="/auth/sign-up" className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-500">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-24 text-center">
        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-300">
          Deterministic EU AI Act compliance record
        </span>
        <h1 className="mt-6 text-4xl font-black leading-tight sm:text-6xl">
          Classify AI system risk tiers and maintain <span className="text-rose-400">audit-ready</span> compliance documentation
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-stone-400">
          A system-of-record for demonstrating EU AI Act compliance: rule-based risk-tier determinations with a rationale
          cited to the governing article, the resulting statutory obligation checklist, Annex IV evidence tracking, and
          the Article 49 registration package, maintained from a single system intake.
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/auth/sign-up" className="rounded-lg bg-rose-600 px-6 py-3 text-base font-semibold text-white hover:bg-rose-500">
            Begin your compliance record
          </Link>
          <Link href="/auth/sign-in" className="rounded-lg border border-stone-700 bg-stone-900 px-6 py-3 text-base font-semibold text-stone-200 hover:bg-stone-800">
            Sign In
          </Link>
        </div>
        <p className="mt-4 text-xs text-stone-500">Available in full to every signed-in account. Classification decisions are rule-based and reproducible, not probabilistic.</p>
      </section>

      {/* Problem */}
      <section className="border-y border-stone-800 bg-stone-900/30 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">Three obligations every EU AI Act compliance function must satisfy</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6">
              <div className="text-3xl font-black text-rose-400">01</div>
              <h3 className="mt-3 text-lg font-semibold">Determine the risk tier defensibly</h3>
              <p className="mt-2 text-sm text-stone-400">The risk taxonomy is distributed across Article 5, the Annex III high-risk catalog, the Article 6(3) derogation, and Article 50 transparency triggers. A defensible determination requires reasoning through each provision and documenting why it does or does not apply.</p>
            </div>
            <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6">
              <div className="text-3xl font-black text-amber-400">02</div>
              <h3 className="mt-3 text-lg font-semibold">Establish which obligations apply, to whom, by when</h3>
              <p className="mt-2 text-sm text-stone-400">High-risk systems trigger risk management, data governance, technical documentation, logging, and human oversight duties under Articles 9 through 26. Determining scope, ownership, and deadline for each obligation is a recurring audit exposure.</p>
            </div>
            <div className="rounded-xl border border-stone-800 bg-stone-900/60 p-6">
              <div className="text-3xl font-black text-rose-400">03</div>
              <h3 className="mt-3 text-lg font-semibold">Produce the conformity record on demand</h3>
              <p className="mt-2 text-sm text-stone-400">Providers must maintain Annex IV technical documentation, complete a conformity assessment, hold a declaration of conformity, and register in the EU database. That record must be assembled and defensible, not scattered across spreadsheets.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Feature grid */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">A single system of record for the Act</h2>
        <p className="mx-auto mt-3 max-w-2xl text-center text-stone-400">From intake through EU-database registration, every classification, obligation, and evidence record is traceable to a specific article for audit purposes.</p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-stone-800 bg-stone-900/60 p-6">
              <h3 className="text-base font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-stone-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-stone-800 bg-gradient-to-b from-stone-900/40 to-stone-950 px-6 py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-black sm:text-4xl">Demonstrate readiness with a cited, reproducible record</h2>
          <p className="mt-4 text-lg text-stone-400">Register your first system, run the classification, and receive the cited rationale, obligation checklist, and evidence tracker required to demonstrate compliance to an auditor or regulator.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth/sign-up" className="rounded-lg bg-rose-600 px-6 py-3 text-base font-semibold text-white hover:bg-rose-500">
              Create your account
            </Link>
            <Link href="/pricing" className="rounded-lg border border-stone-700 bg-stone-900 px-6 py-3 text-base font-semibold text-stone-200 hover:bg-stone-800">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-800 px-6 py-10 text-center text-sm text-stone-600">
        <p className="font-semibold text-stone-400">AiActClassificationDesk</p>
        <p className="mt-1">A deterministic EU AI Act classification and compliance record-keeping workbench. Not legal advice.</p>
      </footer>
    </main>
  )
}
