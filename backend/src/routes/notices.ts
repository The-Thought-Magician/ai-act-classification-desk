import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '../db/index.js'
import { transparency_notices, ai_systems, audit_log } from '../db/schema.js'
import { authMiddleware, getUserId } from '../lib/auth.js'

const router = new Hono()

// Article 50 limited-risk transparency-notice templates, keyed by trigger.
// Bodies use {{token}} placeholders filled from the create/update payload.
interface NoticeTemplate {
  trigger_code: string
  title: string
  article_ref: string
  description: string
  body: string
  tokens: string[]
}

const TEMPLATES: NoticeTemplate[] = [
  {
    trigger_code: 'chatbot',
    title: 'AI System Interaction Disclosure',
    article_ref: 'Art 50(1)',
    description: 'Inform people they are interacting with an AI system.',
    body: 'You are interacting with {{system_name}}, an artificial intelligence system operated by {{provider_name}}. This automated assistant is designed to {{intended_purpose}}. If you would prefer to speak with a human, please {{human_handoff}}.',
    tokens: ['system_name', 'provider_name', 'intended_purpose', 'human_handoff'],
  },
  {
    trigger_code: 'synthetic_content',
    title: 'Synthetic Content Disclosure',
    article_ref: 'Art 50(2)',
    description: 'Mark AI-generated or manipulated audio, image, video or text content.',
    body: 'This content was generated or modified using artificial intelligence ({{system_name}} by {{provider_name}}). It has been produced in a machine-readable and detectable format in accordance with Article 50(2) of the EU AI Act. Content type: {{content_type}}.',
    tokens: ['system_name', 'provider_name', 'content_type'],
  },
  {
    trigger_code: 'deepfake',
    title: 'Deep Fake Disclosure',
    article_ref: 'Art 50(4)',
    description: 'Disclose deep-fake image, audio or video content.',
    body: 'This {{content_type}} has been artificially generated or manipulated (deep fake) using {{system_name}} by {{provider_name}}. The depicted persons, voices, or events do not necessarily reflect reality. This disclosure is provided pursuant to Article 50(4) of the EU AI Act.',
    tokens: ['content_type', 'system_name', 'provider_name'],
  },
  {
    trigger_code: 'emotion_recognition',
    title: 'Emotion Recognition / Biometric Categorisation Notice',
    article_ref: 'Art 50(3)',
    description: 'Inform people exposed to an emotion-recognition or biometric-categorisation system.',
    body: 'You are being exposed to {{system_name}}, an emotion recognition / biometric categorisation system operated by {{provider_name}}. The system processes {{data_processed}} for the purpose of {{intended_purpose}}. This notice is provided under Article 50(3) of the EU AI Act. Processing is carried out in line with applicable data-protection law.',
    tokens: ['system_name', 'provider_name', 'data_processed', 'intended_purpose'],
  },
]

const TEMPLATE_BY_CODE = new Map(TEMPLATES.map((t) => [t.trigger_code, t]))

function renderTokens(body: string, tokens: Record<string, string>): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key) => {
    const v = tokens[key]
    return v !== undefined && v !== null && v !== '' ? String(v) : `[${key}]`
  })
}

function toHtml(text: string): string {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const paras = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
  return `<div class="ai-act-transparency-notice">\n${paras}\n</div>`
}

// GET / — all notices for user (filter system_id)
router.get('/', async (c) => {
  const userId = getUserId(c)
  if (!userId) return c.json({ error: 'Unauthorized' }, 401)
  const { system_id } = c.req.query()
  const conds = [eq(transparency_notices.user_id, userId)]
  if (system_id) conds.push(eq(transparency_notices.system_id, system_id))
  const rows = await db
    .select()
    .from(transparency_notices)
    .where(and(...conds))
    .orderBy(desc(transparency_notices.created_at))
  return c.json(rows)
})

// GET /templates/list — available notice templates per trigger (placed before /:id)
router.get('/templates/list', (c) => {
  return c.json(
    TEMPLATES.map((t) => ({
      trigger_code: t.trigger_code,
      title: t.title,
      article_ref: t.article_ref,
      description: t.description,
      body: t.body,
      tokens: t.tokens,
    })),
  )
})

// GET /:id — notice detail
router.get('/:id', async (c) => {
  const [notice] = await db
    .select()
    .from(transparency_notices)
    .where(eq(transparency_notices.id, c.req.param('id')))
  if (!notice) return c.json({ error: 'Not found' }, 404)
  return c.json(notice)
})

// POST / — create notice from template + tokens (new version)
const createSchema = z.object({
  system_id: z.string().min(1),
  trigger_code: z.enum(['chatbot', 'synthetic_content', 'deepfake', 'emotion_recognition']),
  locale: z.string().optional().default('en'),
  tokens: z.record(z.string()).optional().default({}),
  body: z.string().optional(),
})

router.post('/', authMiddleware, zValidator('json', createSchema), async (c) => {
  const userId = getUserId(c)
  const body = c.req.valid('json')

  // ownership check on the parent system
  const [system] = await db.select().from(ai_systems).where(eq(ai_systems.id, body.system_id))
  if (!system) return c.json({ error: 'System not found' }, 404)
  if (system.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const template = TEMPLATE_BY_CODE.get(body.trigger_code)
  // resolve next version for this (system, trigger, locale)
  const siblings = await db
    .select()
    .from(transparency_notices)
    .where(
      and(
        eq(transparency_notices.system_id, body.system_id),
        eq(transparency_notices.trigger_code, body.trigger_code),
        eq(transparency_notices.locale, body.locale),
      ),
    )
  const nextVersion = siblings.reduce((m, n) => Math.max(m, n.version), 0) + 1

  const resolvedBody =
    body.body && body.body.trim().length > 0
      ? body.body
      : renderTokens(template?.body ?? '', body.tokens)

  const [notice] = await db
    .insert(transparency_notices)
    .values({
      system_id: body.system_id,
      user_id: userId,
      trigger_code: body.trigger_code,
      locale: body.locale,
      version: nextVersion,
      body: resolvedBody,
      body_html: toHtml(resolvedBody),
      published: false,
      created_by: userId,
    })
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'create',
    entity_type: 'transparency_notice',
    entity_id: notice.id,
    summary: `Created ${body.trigger_code} notice v${nextVersion} for ${system.name}`,
    meta: { trigger_code: body.trigger_code, version: nextVersion },
  })

  return c.json(notice, 201)
})

// PUT /:id — edit notice (creates next version)
const editSchema = z.object({
  body: z.string().optional(),
  tokens: z.record(z.string()).optional(),
  locale: z.string().optional(),
})

router.put('/:id', authMiddleware, zValidator('json', editSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const [existing] = await db
    .select()
    .from(transparency_notices)
    .where(eq(transparency_notices.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  const body = c.req.valid('json')
  const locale = body.locale ?? existing.locale
  const template = TEMPLATE_BY_CODE.get(existing.trigger_code)

  let resolvedBody = existing.body
  if (body.body && body.body.trim().length > 0) {
    resolvedBody = body.body
  } else if (body.tokens) {
    resolvedBody = renderTokens(template?.body ?? existing.body, body.tokens)
  }

  // next version within the same (system, trigger, locale) lineage
  const siblings = await db
    .select()
    .from(transparency_notices)
    .where(
      and(
        eq(transparency_notices.system_id, existing.system_id),
        eq(transparency_notices.trigger_code, existing.trigger_code),
        eq(transparency_notices.locale, locale),
      ),
    )
  const nextVersion = siblings.reduce((m, n) => Math.max(m, n.version), 0) + 1

  const [notice] = await db
    .insert(transparency_notices)
    .values({
      system_id: existing.system_id,
      user_id: userId,
      trigger_code: existing.trigger_code,
      locale,
      version: nextVersion,
      body: resolvedBody,
      body_html: toHtml(resolvedBody),
      published: false,
      created_by: userId,
    })
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: 'update',
    entity_type: 'transparency_notice',
    entity_id: notice.id,
    summary: `Revised ${existing.trigger_code} notice to v${nextVersion}`,
    meta: { from_id: id, version: nextVersion },
  })

  return c.json(notice)
})

// POST /:id/publish — publish/unpublish (body { published })
const publishSchema = z.object({ published: z.boolean() })

router.post('/:id/publish', authMiddleware, zValidator('json', publishSchema), async (c) => {
  const userId = getUserId(c)
  const id = c.req.param('id')
  const { published } = c.req.valid('json')
  const [existing] = await db
    .select()
    .from(transparency_notices)
    .where(eq(transparency_notices.id, id))
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.user_id !== userId) return c.json({ error: 'Forbidden' }, 403)

  // When publishing, unpublish other versions in the same lineage so only one is live.
  if (published) {
    const lineage = await db
      .select()
      .from(transparency_notices)
      .where(
        and(
          eq(transparency_notices.system_id, existing.system_id),
          eq(transparency_notices.trigger_code, existing.trigger_code),
          eq(transparency_notices.locale, existing.locale),
        ),
      )
    for (const n of lineage) {
      if (n.id !== id && n.published) {
        await db
          .update(transparency_notices)
          .set({ published: false })
          .where(eq(transparency_notices.id, n.id))
      }
    }
  }

  const [notice] = await db
    .update(transparency_notices)
    .set({ published })
    .where(eq(transparency_notices.id, id))
    .returning()

  await db.insert(audit_log).values({
    user_id: userId,
    action: published ? 'publish' : 'unpublish',
    entity_type: 'transparency_notice',
    entity_id: id,
    summary: `${published ? 'Published' : 'Unpublished'} ${existing.trigger_code} notice v${existing.version}`,
    meta: { published },
  })

  return c.json(notice)
})

export default router
