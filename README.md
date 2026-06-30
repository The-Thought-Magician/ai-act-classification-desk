# AI Act Classification Desk

Classify every AI system into its EU AI Act risk tier and generate the obligation checklist, conformity evidence, and registration package.

AiActClassificationDesk is a governance workbench that turns the EU AI Act from a 100-page legal text into an operational, system-by-system compliance engine. A company registers each AI system it builds, buys, or deploys; the platform walks a deterministic rules questionnaire derived from the Act's Annex III high-risk categories and Article 5 prohibited-practice list; and it outputs a defensible risk-tier classification (prohibited, high, limited, minimal) with a cited rationale for every rule that fired. From that classification it derives the tier-specific statutory obligation checklist, tracks the Annex IV technical-documentation evidence with a readiness score, assembles the EU high-risk registration package, and generates versioned transparency notices for limited-risk systems.

The product is deterministic by design: the same intake answers always produce the same tier and the same obligations, every rule hit is traceable to an Act article, and nothing depends on a probabilistic model. This is what makes the output legally defensible.

For the full product specification, see [docs/idea.md](docs/idea.md).

## Stack

- Backend: Hono + TypeScript, mounted under `/api/v1`, run with `node --import tsx/esm src/index.ts`.
- Frontend: Next.js 16 + React 19 + TypeScript (strict) + Tailwind 4, App Router, Neon Auth.
- Database: Neon Postgres via drizzle-orm.
- The classifier is a deterministic rules engine: a versioned decision tree over a structured intake covering Article 5 prohibited practices, Annex III high-risk categories, and Article 50 limited-risk transparency triggers.
- Built-in sample-data seeder so classification, obligations, and gap scoring are demoable on first boot.

## Local Development

Requires Node 22+, pnpm, and a Neon Postgres connection string. Provision the database schema out-of-band first (the app seeds sample data but does not create its own tables).

### Backend

```bash
cd backend
pnpm install
pnpm dev
```

The backend listens on `http://localhost:3001` (override with `PORT`). Health check at `/health`; API mounted under `/api/v1`.

### Frontend

```bash
cd web
pnpm install
pnpm dev
```

The frontend runs on `http://localhost:3000` and proxies API calls through `/api/proxy/*` to the backend, injecting the authenticated user via the `X-User-Id` header.

### Docker Compose

Bring both services up together:

```bash
docker compose up --build
```

## Environment Variables

### Backend (`backend/.env`)

```
PORT=3001
DATABASE_URL=postgres://user:password@host/db?sslmode=require
FRONTEND_URL=http://localhost:3000
ADMIN_USER_IDS=
# STRIPE_SECRET_KEY=
# STRIPE_PRO_PRICE_ID=
# STRIPE_WEBHOOK_SECRET=
```

### Frontend (`web/.env.local`)

```
NEON_AUTH_BASE_URL=https://<endpoint>.neonauth.<region>.aws.neon.tech/<db>/auth
NEON_AUTH_COOKIE_SECRET=<random 32-byte hex>
NEXT_PUBLIC_API_URL=http://localhost:3001
```

`NEXT_PUBLIC_API_URL` is the only `NEXT_PUBLIC_*` variable and is baked into the bundle at build time. `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` are server-only.

## Pricing

All features are FREE for signed-in users. Stripe is optional: checkout, portal, and webhook endpoints return `503` when Stripe is not configured.
