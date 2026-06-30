// All calls are same-origin relative fetch('/api/proxy/<path>') mapping 1:1 to
// the backend's /api/v1/<path>. The proxy route injects X-User-Id after
// server-side session resolution. Mutations send Content-Type: application/json.

type Params = Record<string, string | number | boolean | undefined | null>

function qs(params?: Params): string {
  if (!params) return ''
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

async function jget(path: string) {
  const r = await fetch(`/api/proxy/${path}`)
  if (!r.ok) throw new Error((await r.text()) || `GET ${path} failed (${r.status})`)
  return r.json()
}

async function jsend(method: string, path: string, body?: unknown) {
  const r = await fetch(`/api/proxy/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!r.ok) throw new Error((await r.text()) || `${method} ${path} failed (${r.status})`)
  return r.json()
}

const api = {
  // Systems
  listSystems: (params?: Params) => jget(`systems${qs(params)}`),
  getSystem: (id: string) => jget(`systems/${id}`),
  createSystem: (body: unknown) => jsend('POST', 'systems', body),
  updateSystem: (id: string, body: unknown) => jsend('PUT', `systems/${id}`, body),
  deleteSystem: (id: string) => jsend('DELETE', `systems/${id}`),
  archiveSystem: (id: string, archived: boolean) => jsend('POST', `systems/${id}/archive`, { archived }),
  getSystemVersions: (id: string) => jget(`systems/${id}/versions`),
  getSystemActivity: (id: string) => jget(`systems/${id}/activity`),

  // Classify
  getQuestionnaire: () => jget('classify/questionnaire'),
  getClassification: (systemId: string) => jget(`classify/${systemId}`),
  getClassificationHistory: (systemId: string) => jget(`classify/${systemId}/history`),
  runClassification: (systemId: string, answers: unknown) => jsend('POST', `classify/${systemId}/run`, { answers }),
  overrideClassification: (systemId: string, body: unknown) => jsend('POST', `classify/${systemId}/override`, body),

  // Obligations
  listObligations: (params?: Params) => jget(`obligations${qs(params)}`),
  getSystemObligations: (systemId: string) => jget(`obligations/system/${systemId}`),
  regenerateObligations: (systemId: string) => jsend('POST', `obligations/system/${systemId}/regenerate`),
  updateObligation: (id: string, body: unknown) => jsend('PUT', `obligations/${id}`, body),

  // Evidence
  listEvidence: (params?: Params) => jget(`evidence${qs(params)}`),
  getSystemEvidence: (systemId: string) => jget(`evidence/system/${systemId}`),
  updateEvidenceRequirement: (id: string, body: unknown) => jsend('PUT', `evidence/requirement/${id}`, body),
  listArtifacts: () => jget('evidence/artifacts'),
  createArtifact: (body: unknown) => jsend('POST', 'evidence/artifacts', body),
  deleteArtifact: (id: string) => jsend('DELETE', `evidence/artifacts/${id}`),

  // Notices
  listNotices: (params?: Params) => jget(`notices${qs(params)}`),
  getNotice: (id: string) => jget(`notices/${id}`),
  createNotice: (body: unknown) => jsend('POST', 'notices', body),
  updateNotice: (id: string, body: unknown) => jsend('PUT', `notices/${id}`, body),
  publishNotice: (id: string, published: boolean) => jsend('POST', `notices/${id}/publish`, { published }),
  listNoticeTemplates: () => jget('notices/templates/list'),

  // Registry
  listRegistryPackages: () => jget('registry'),
  getRegistryPackage: (systemId: string) => jget(`registry/system/${systemId}`),
  updateRegistryPackage: (systemId: string, body: unknown) => jsend('PUT', `registry/system/${systemId}`, body),
  submitRegistryPackage: (systemId: string) => jsend('POST', `registry/system/${systemId}/submit`),

  // Roles
  getSystemRoleEvents: (systemId: string) => jget(`roles/system/${systemId}`),
  listRoleEvents: () => jget('roles'),
  createRoleEvent: (systemId: string, body: unknown) => jsend('POST', `roles/system/${systemId}`, body),

  // Dashboard
  getDashboardSummary: () => jget('dashboard/summary'),

  // Deadlines
  getDeadlines: () => jget('deadlines'),
  createDeadline: (body: unknown) => jsend('POST', 'deadlines', body),
  deleteDeadline: (id: string) => jsend('DELETE', `deadlines/${id}`),

  // Analytics
  getAnalyticsOverview: () => jget('analytics/overview'),
  getAnalyticsTrends: () => jget('analytics/trends'),

  // Search
  search: (q: string) => jget(`search${qs({ q })}`),

  // Tags
  listTags: () => jget('tags'),
  createTag: (body: unknown) => jsend('POST', 'tags', body),
  deleteTag: (id: string) => jsend('DELETE', `tags/${id}`),
  assignTags: (body: unknown) => jsend('POST', 'tags/assign', body),

  // Filters
  listFilters: () => jget('filters'),
  createFilter: (body: unknown) => jsend('POST', 'filters', body),
  deleteFilter: (id: string) => jsend('DELETE', `filters/${id}`),

  // Bulk
  bulkReclassify: (body: unknown) => jsend('POST', 'bulk/reclassify', body),
  bulkUpdateSystems: (body: unknown) => jsend('POST', 'bulk/systems', body),
  bulkUpdateObligations: (body: unknown) => jsend('POST', 'bulk/obligations', body),

  // Notifications
  listNotifications: () => jget('notifications'),
  markNotificationRead: (id: string) => jsend('POST', `notifications/${id}/read`),
  markAllNotificationsRead: () => jsend('POST', 'notifications/read-all'),

  // Webhooks
  listWebhooks: () => jget('webhooks'),
  createWebhook: (body: unknown) => jsend('POST', 'webhooks', body),
  updateWebhook: (id: string, body: unknown) => jsend('PUT', `webhooks/${id}`, body),
  deleteWebhook: (id: string) => jsend('DELETE', `webhooks/${id}`),
  getWebhookDeliveries: (id: string) => jget(`webhooks/${id}/deliveries`),
  testWebhook: (id: string) => jsend('POST', `webhooks/${id}/test`),

  // API keys
  listApiKeys: () => jget('api-keys'),
  createApiKey: (body: unknown) => jsend('POST', 'api-keys', body),
  deleteApiKey: (id: string) => jsend('DELETE', `api-keys/${id}`),

  // Audit
  getAuditLog: (params?: Params) => jget(`audit${qs(params)}`),

  // Settings
  getSettings: () => jget('settings'),
  updateSettings: (body: unknown) => jsend('PUT', 'settings', body),
  resetDemo: () => jsend('POST', 'settings/reset-demo'),

  // Onboarding
  getOnboarding: () => jget('onboarding'),
  updateOnboarding: (body: unknown) => jsend('PUT', 'onboarding', body),

  // Rulesets
  getRuleset: () => jget('rulesets/current'),

  // Billing
  getBillingPlan: () => jget('billing/plan'),
  startCheckout: () => jsend('POST', 'billing/checkout'),
  openPortal: () => jsend('POST', 'billing/portal'),
}

export default api
