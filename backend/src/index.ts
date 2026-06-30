import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { db } from './db/index.js'
import { migrate } from './db/migrate.js'
import { plans, ai_systems } from './db/schema.js'
import { eq } from 'drizzle-orm'

import systemsRoutes from './routes/systems.js'
import classifyRoutes from './routes/classify.js'
import obligationsRoutes from './routes/obligations.js'
import evidenceRoutes from './routes/evidence.js'
import noticesRoutes from './routes/notices.js'
import registryRoutes from './routes/registry.js'
import rolesRoutes from './routes/roles.js'
import dashboardRoutes from './routes/dashboard.js'
import deadlinesRoutes from './routes/deadlines.js'
import analyticsRoutes from './routes/analytics.js'
import searchRoutes from './routes/search.js'
import tagsRoutes from './routes/tags.js'
import filtersRoutes from './routes/filters.js'
import bulkRoutes from './routes/bulk.js'
import notificationsRoutes from './routes/notifications.js'
import webhooksRoutes from './routes/webhooks.js'
import apiKeysRoutes from './routes/apiKeys.js'
import auditRoutes from './routes/audit.js'
import settingsRoutes from './routes/settings.js'
import onboardingRoutes from './routes/onboarding.js'
import rulesetsRoutes from './routes/rulesets.js'
import billingRoutes from './routes/billing.js'

const app = new Hono()

const allowedOrigins = [
  process.env.FRONTEND_URL ?? 'http://localhost:3000',
  'https://ai-act-classification-desk-ventures.vercel.app',
]

app.use('*', cors({
  origin: (origin) => (allowedOrigins.includes(origin) ? origin : allowedOrigins[0]),
  credentials: true,
}))

const api = new Hono()
api.route('/systems', systemsRoutes)
api.route('/classify', classifyRoutes)
api.route('/obligations', obligationsRoutes)
api.route('/evidence', evidenceRoutes)
api.route('/notices', noticesRoutes)
api.route('/registry', registryRoutes)
api.route('/roles', rolesRoutes)
api.route('/dashboard', dashboardRoutes)
api.route('/deadlines', deadlinesRoutes)
api.route('/analytics', analyticsRoutes)
api.route('/search', searchRoutes)
api.route('/tags', tagsRoutes)
api.route('/filters', filtersRoutes)
api.route('/bulk', bulkRoutes)
api.route('/notifications', notificationsRoutes)
api.route('/webhooks', webhooksRoutes)
api.route('/api-keys', apiKeysRoutes)
api.route('/audit', auditRoutes)
api.route('/settings', settingsRoutes)
api.route('/onboarding', onboardingRoutes)
api.route('/rulesets', rulesetsRoutes)
api.route('/billing', billingRoutes)

app.route('/api/v1', api)
app.get('/health', (c) => c.json({ ok: true }))

const DEMO_USER_ID = 'demo-user'

// Idempotent seed: ensure billing plans exist, then a small demo system set.
// Count-then-insert so repeated boots never duplicate rows.
async function seedIfEmpty() {
  // Plans (free / pro)
  const freePlan = await db.select().from(plans).where(eq(plans.id, 'free')).limit(1)
  if (freePlan.length === 0) {
    await db.insert(plans).values({ id: 'free', name: 'Free', price_cents: 0 }).onConflictDoNothing()
  }
  const proPlan = await db.select().from(plans).where(eq(plans.id, 'pro')).limit(1)
  if (proPlan.length === 0) {
    await db.insert(plans).values({ id: 'pro', name: 'Pro', price_cents: 4900 }).onConflictDoNothing()
  }

  // Demo systems (only if the demo user has none).
  const existing = await db.select().from(ai_systems).where(eq(ai_systems.user_id, DEMO_USER_ID)).limit(1)
  if (existing.length === 0) {
    const demoSystems = [
      {
        user_id: DEMO_USER_ID,
        name: 'CV Screening Assistant',
        description: 'Ranks job applicants from uploaded CVs for an HR team.',
        role: 'provider',
        intended_purpose: 'Automated screening and ranking of employment applications.',
        purpose_category: 'employment',
        modality: 'text',
        geographies: ['EU', 'DE'],
        placed_on_eu_market: true,
        lifecycle_stage: 'production',
        is_gpai: false,
        is_systemic_risk: false,
        status: 'classified',
        current_tier: 'high',
        tags: ['hr', 'annex-iii'],
      },
      {
        user_id: DEMO_USER_ID,
        name: 'Support Chatbot',
        description: 'Customer-facing conversational agent for billing questions.',
        role: 'deployer',
        intended_purpose: 'Answer customer support queries via chat.',
        purpose_category: 'customer_service',
        modality: 'text',
        geographies: ['EU', 'FR'],
        placed_on_eu_market: true,
        lifecycle_stage: 'production',
        is_gpai: false,
        is_systemic_risk: false,
        status: 'classified',
        current_tier: 'limited',
        tags: ['chatbot', 'art-50'],
      },
      {
        user_id: DEMO_USER_ID,
        name: 'Credit Scoring Engine',
        description: 'Evaluates creditworthiness of loan applicants.',
        role: 'provider',
        intended_purpose: 'Assess credit risk for consumer lending decisions.',
        purpose_category: 'creditworthiness',
        modality: 'tabular',
        geographies: ['EU', 'ES'],
        placed_on_eu_market: true,
        lifecycle_stage: 'production',
        is_gpai: false,
        is_systemic_risk: false,
        status: 'under_review',
        current_tier: 'high',
        tags: ['finance', 'annex-iii'],
      },
      {
        user_id: DEMO_USER_ID,
        name: 'Marketing Copy Generator',
        description: 'Generates promotional copy from product briefs.',
        role: 'deployer',
        intended_purpose: 'Draft marketing copy for internal review.',
        purpose_category: 'content_generation',
        modality: 'text',
        geographies: ['EU'],
        placed_on_eu_market: true,
        lifecycle_stage: 'production',
        is_gpai: true,
        is_systemic_risk: false,
        status: 'classified',
        current_tier: 'minimal',
        tags: ['gpai', 'content'],
      },
      {
        user_id: DEMO_USER_ID,
        name: 'Emotion Recognition Kiosk',
        description: 'Infers shopper emotions at retail kiosks for analytics.',
        role: 'provider',
        intended_purpose: 'Emotion inference for in-store experience analytics.',
        purpose_category: 'emotion_recognition',
        modality: 'vision',
        geographies: ['EU', 'IT'],
        placed_on_eu_market: true,
        lifecycle_stage: 'pilot',
        is_gpai: false,
        is_systemic_risk: false,
        status: 'draft',
        current_tier: 'prohibited',
        tags: ['biometrics', 'art-5'],
      },
    ]
    for (const s of demoSystems) {
      await db.insert(ai_systems).values(s as any)
    }
    console.log('Seeded demo AI systems')
  }
}

const port = parseInt(process.env.PORT ?? '3001')

// CRITICAL boot order: bind the port FIRST so the platform health check sees a
// live service immediately, THEN run migrate()/seedIfEmpty() (each idempotent,
// each wrapped in its own try/catch). Never block serve() on a cold DB.
serve({ fetch: app.fetch, port }, () => console.log(`Server running on port ${port}`))

migrate()
  .then(() => console.log('migrate() complete'))
  .catch((e) => console.error('migrate() error:', e))
  .finally(() => {
    seedIfEmpty()
      .then(() => console.log('seedIfEmpty() complete'))
      .catch((e) => console.error('seedIfEmpty() error:', e))
  })

export default app
