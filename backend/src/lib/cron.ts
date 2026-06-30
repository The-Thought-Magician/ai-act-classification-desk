// cron.ts — deterministic scheduling-conflict engine.
// Pure functions, no external services. Used by routes to validate/describe
// schedule expressions, project firings, and detect collisions / DST traps /
// coverage gaps, and to suggest auto-spread fixes.
//
// Three schedule "kinds" are supported:
//   - 'cron'   : a standard 5-field cron expression, parsed via cron-parser.
//   - 'rate'   : "every N minutes|hours|days" computed arithmetically.
//   - 'oneoff' : a single ISO timestamp; fires once if in the future.

import { CronExpressionParser } from 'cron-parser'

export type ScheduleKind = 'cron' | 'rate' | 'oneoff'

export interface Job {
  id: string
  kind: ScheduleKind
  expr: string
  timezone?: string
  resourceId?: string
}

export interface ValidationResult {
  valid: boolean
  error?: string
}

export interface Collision {
  windowStart: string
  windowEnd: string
  jobIds: string[]
  severity: 'low' | 'medium' | 'high'
  resourceId?: string
}

export interface HeatmapBucket {
  bucket: string
  count: number
}

export type DstTrapType = 'double_fire' | 'skip' | 'ambiguous'

export interface DstTrap {
  type: DstTrapType
  atLocal: string
  atUtc: string
}

export interface CoverageGap {
  windowStart: string
  windowEnd: string
  durationMinutes: number
}

export interface SpreadSuggestion {
  jobId: string
  suggestedExpr: string
  reason: string
}

export interface CoverageWindow {
  // A required coverage window expressed as a recurring expectation.
  // start/end are ISO timestamps describing the period that must be covered.
  start: string
  end: string
}

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const DEFAULT_TZ = 'UTC'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function isValidIso(s: string): boolean {
  if (typeof s !== 'string' || s.length === 0) return false
  const t = Date.parse(s)
  return Number.isFinite(t)
}

function toIso(d: Date): string {
  return d.toISOString()
}

// Floor a Date to the start of its minute (UTC).
function floorToMinute(ms: number): number {
  return Math.floor(ms / MINUTE_MS) * MINUTE_MS
}

// Parse a "rate" expression: "every N minutes|hours|days".
// Returns the interval in milliseconds, or null if it does not parse.
function parseRate(expr: string): { ms: number; n: number; unit: 'minutes' | 'hours' | 'days' } | null {
  const m = expr.trim().toLowerCase().match(/^every\s+(\d+)\s+(minute|minutes|hour|hours|day|days)$/)
  if (!m) return null
  const n = parseInt(m[1], 10)
  if (!Number.isFinite(n) || n <= 0) return null
  const rawUnit = m[2]
  if (rawUnit.startsWith('minute')) return { ms: n * MINUTE_MS, n, unit: 'minutes' }
  if (rawUnit.startsWith('hour')) return { ms: n * HOUR_MS, n, unit: 'hours' }
  return { ms: n * DAY_MS, n, unit: 'days' }
}

// Get the UTC-offset (in minutes) that a given timezone has at instant `date`.
// Positive means ahead of UTC (e.g. +120 for CEST).
function tzOffsetMinutes(date: Date, timeZone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = dtf.formatToParts(date)
    const map: Record<string, string> = {}
    for (const p of parts) map[p.type] = p.value
    const asUTC = Date.UTC(
      parseInt(map.year, 10),
      parseInt(map.month, 10) - 1,
      parseInt(map.day, 10),
      parseInt(map.hour, 10),
      parseInt(map.minute, 10),
      parseInt(map.second, 10),
    )
    return Math.round((asUTC - date.getTime()) / MINUTE_MS)
  } catch {
    return 0
  }
}

// Format an instant as a local wall-clock ISO-like string in a timezone.
function formatLocal(date: Date, timeZone: string): string {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    const parts = dtf.formatToParts(date)
    const map: Record<string, string> = {}
    for (const p of parts) map[p.type] = p.value
    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`
  } catch {
    return date.toISOString()
  }
}

// ---------------------------------------------------------------------------
// validateExpression
// ---------------------------------------------------------------------------

export function validateExpression(kind: ScheduleKind, expr: string): ValidationResult {
  if (typeof expr !== 'string' || expr.trim().length === 0) {
    return { valid: false, error: 'Expression is empty' }
  }
  if (kind === 'cron') {
    try {
      CronExpressionParser.parse(expr)
      return { valid: true }
    } catch (e) {
      return { valid: false, error: e instanceof Error ? e.message : 'Invalid cron expression' }
    }
  }
  if (kind === 'rate') {
    const r = parseRate(expr)
    if (!r) return { valid: false, error: 'Rate must be "every N minutes|hours|days"' }
    return { valid: true }
  }
  if (kind === 'oneoff') {
    if (!isValidIso(expr)) return { valid: false, error: 'One-off must be a valid ISO timestamp' }
    return { valid: true }
  }
  return { valid: false, error: `Unknown schedule kind: ${kind}` }
}

// ---------------------------------------------------------------------------
// describeExpression
// ---------------------------------------------------------------------------

export function describeExpression(kind: ScheduleKind, expr: string, timezone: string = DEFAULT_TZ): string {
  const v = validateExpression(kind, expr)
  if (!v.valid) return `Invalid schedule: ${v.error}`
  if (kind === 'rate') {
    const r = parseRate(expr)!
    const unit = r.n === 1 ? r.unit.replace(/s$/, '') : r.unit
    return `Every ${r.n} ${unit}`
  }
  if (kind === 'oneoff') {
    return `Once at ${expr} (${timezone})`
  }
  // cron
  const fields = expr.trim().split(/\s+/)
  const [min, hour, dom, mon, dow] = fields
  const tzNote = timezone && timezone !== DEFAULT_TZ ? ` (${timezone})` : ' (UTC)'
  // A few common, human-friendly shapes; otherwise fall back to the raw fields.
  if (min === '0' && hour === '0' && dom === '*' && mon === '*' && dow === '*') {
    return `Every day at midnight${tzNote}`
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && dow === '*') {
    return `Every day at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}${tzNote}`
  }
  if (min.startsWith('*/') && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every ${min.slice(2)} minutes${tzNote}`
  }
  if (/^\d+$/.test(min) && hour === '*' && dom === '*' && mon === '*' && dow === '*') {
    return `Every hour at minute ${min}${tzNote}`
  }
  if (/^\d+$/.test(min) && /^\d+$/.test(hour) && dom === '*' && mon === '*' && /^[0-7]$/.test(dow)) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
    return `Every ${days[parseInt(dow, 10)]} at ${hour.padStart(2, '0')}:${min.padStart(2, '0')}${tzNote}`
  }
  return `Cron "${expr}"${tzNote}`
}

// ---------------------------------------------------------------------------
// nextFirings
// ---------------------------------------------------------------------------

export function nextFirings(
  kind: ScheduleKind,
  expr: string,
  timezone: string = DEFAULT_TZ,
  fromISO: string = new Date().toISOString(),
  count: number = 10,
): string[] {
  const v = validateExpression(kind, expr)
  if (!v.valid) return []
  const n = Math.max(0, Math.min(count | 0, 10000))
  if (n === 0) return []
  const from = isValidIso(fromISO) ? new Date(fromISO) : new Date()

  if (kind === 'oneoff') {
    const when = new Date(expr)
    return when.getTime() > from.getTime() ? [toIso(when)] : []
  }

  if (kind === 'rate') {
    const r = parseRate(expr)!
    const out: string[] = []
    let t = from.getTime() + r.ms
    for (let i = 0; i < n; i++) {
      out.push(toIso(new Date(t)))
      t += r.ms
    }
    return out
  }

  // cron
  try {
    const interval = CronExpressionParser.parse(expr, { tz: timezone, currentDate: from })
    const out: string[] = []
    for (let i = 0; i < n; i++) {
      const next = interval.next()
      out.push(new Date(next.getTime()).toISOString())
    }
    return out
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// firing projection within a horizon (internal helper)
// ---------------------------------------------------------------------------

function firingsInHorizon(job: Job, fromMs: number, horizonDays: number): number[] {
  const horizonEnd = fromMs + horizonDays * DAY_MS
  const fromISO = new Date(fromMs).toISOString()
  const tz = job.timezone ?? DEFAULT_TZ

  if (job.kind === 'oneoff') {
    const v = validateExpression('oneoff', job.expr)
    if (!v.valid) return []
    const t = new Date(job.expr).getTime()
    return t > fromMs && t <= horizonEnd ? [floorToMinute(t)] : []
  }

  if (job.kind === 'rate') {
    const r = parseRate(job.expr)
    if (!r) return []
    const out: number[] = []
    let t = fromMs + r.ms
    // Cap to avoid runaway loops for tiny intervals over long horizons.
    let guard = 0
    while (t <= horizonEnd && guard < 200000) {
      out.push(floorToMinute(t))
      t += r.ms
      guard++
    }
    return out
  }

  // cron
  try {
    const interval = CronExpressionParser.parse(job.expr, { tz, currentDate: new Date(fromISO) })
    const out: number[] = []
    let guard = 0
    while (guard < 200000) {
      const next = interval.next()
      const ms = next.getTime()
      if (ms > horizonEnd) break
      out.push(floorToMinute(ms))
      guard++
    }
    return out
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// computeCollisions
// ---------------------------------------------------------------------------

export function computeCollisions(
  jobs: Job[],
  opts: { horizonDays?: number; threshold?: number } = {},
): Collision[] {
  const horizonDays = opts.horizonDays ?? 7
  const threshold = Math.max(2, opts.threshold ?? 2)
  const now = floorToMinute(Date.now())

  // bucketMs -> list of {jobId, resourceId?}
  const buckets = new Map<number, Array<{ jobId: string; resourceId?: string }>>()

  for (const job of jobs) {
    const firings = firingsInHorizon(job, now, horizonDays)
    for (const ms of firings) {
      const arr = buckets.get(ms) ?? []
      arr.push({ jobId: job.id, resourceId: job.resourceId })
      buckets.set(ms, arr)
    }
  }

  const collisions: Collision[] = []
  for (const [ms, entries] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    const concurrency = entries.length

    // Resource contention: 2+ jobs sharing the same resourceId in this minute.
    const byResource = new Map<string, string[]>()
    for (const e of entries) {
      if (!e.resourceId) continue
      const arr = byResource.get(e.resourceId) ?? []
      arr.push(e.jobId)
      byResource.set(e.resourceId, arr)
    }
    let resourceClash: { resourceId: string; jobIds: string[] } | null = null
    for (const [rid, ids] of byResource.entries()) {
      if (ids.length >= 2) {
        resourceClash = { resourceId: rid, jobIds: [...new Set(ids)] }
        break
      }
    }

    const overThreshold = concurrency >= threshold
    if (!overThreshold && !resourceClash) continue

    const jobIds = resourceClash ? resourceClash.jobIds : [...new Set(entries.map((e) => e.jobId))]

    let severity: Collision['severity'] = 'low'
    if (resourceClash || concurrency >= threshold + 2) severity = 'high'
    else if (concurrency >= threshold + 1) severity = 'medium'

    collisions.push({
      windowStart: new Date(ms).toISOString(),
      windowEnd: new Date(ms + MINUTE_MS).toISOString(),
      jobIds,
      severity,
      ...(resourceClash ? { resourceId: resourceClash.resourceId } : {}),
    })
  }

  return collisions
}

// ---------------------------------------------------------------------------
// loadHeatmap
// ---------------------------------------------------------------------------

export function loadHeatmap(jobs: Job[], opts: { horizonDays?: number } = {}): HeatmapBucket[] {
  const horizonDays = opts.horizonDays ?? 7
  const now = floorToMinute(Date.now())
  // Bucket by hour over the horizon for a usable heatmap density.
  const counts = new Map<number, number>()

  for (const job of jobs) {
    const firings = firingsInHorizon(job, now, horizonDays)
    for (const ms of firings) {
      const hourBucket = Math.floor(ms / HOUR_MS) * HOUR_MS
      counts.set(hourBucket, (counts.get(hourBucket) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ms, count]) => ({ bucket: new Date(ms).toISOString(), count }))
}

// ---------------------------------------------------------------------------
// dstTraps
// ---------------------------------------------------------------------------

export function dstTraps(
  kind: ScheduleKind,
  expr: string,
  timezone: string = DEFAULT_TZ,
  fromISO: string = new Date().toISOString(),
  days: number = 365,
): DstTrap[] {
  if (!timezone || timezone === DEFAULT_TZ) return []
  const v = validateExpression(kind, expr)
  if (!v.valid) return []
  const from = isValidIso(fromISO) ? new Date(fromISO) : new Date()
  const start = from.getTime()
  const end = start + days * DAY_MS

  // 1. Find DST transition instants by scanning hourly offset changes.
  const transitions: Array<{ at: number; before: number; after: number }> = []
  let prevOffset = tzOffsetMinutes(new Date(start), timezone)
  for (let t = start + HOUR_MS; t <= end; t += HOUR_MS) {
    const off = tzOffsetMinutes(new Date(t), timezone)
    if (off !== prevOffset) {
      // Narrow the transition to the minute.
      let lo = t - HOUR_MS
      let hi = t
      while (hi - lo > MINUTE_MS) {
        const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS
        const mOff = tzOffsetMinutes(new Date(mid), timezone)
        if (mOff === prevOffset) lo = mid
        else hi = mid
      }
      transitions.push({ at: hi, before: prevOffset, after: off })
      prevOffset = off
    }
  }
  if (transitions.length === 0) return []

  const traps: DstTrap[] = []

  // 2. Project firings and classify any that land near a transition.
  const job: Job = { id: '_probe', kind, expr, timezone }
  const firings = firingsInHorizon(job, start, days)

  for (const tr of transitions) {
    const springForward = tr.after > tr.before // clock jumps forward → "skip" window
    const fallBack = tr.after < tr.before // clock repeats an hour → "ambiguous"/"double_fire"
    const gapMs = Math.abs(tr.after - tr.before) * MINUTE_MS
    const windowStart = tr.at
    const windowEnd = tr.at + gapMs

    if (springForward) {
      // Local wall-clock times in [windowStart, windowEnd) do not exist → skipped.
      for (const ms of firings) {
        if (ms >= windowStart && ms < windowEnd) {
          traps.push({
            type: 'skip',
            atLocal: formatLocal(new Date(ms), timezone),
            atUtc: new Date(ms).toISOString(),
          })
        }
      }
    } else if (fallBack) {
      // Clock turns back: the wall-clock hour immediately BEFORE the transition
      // instant repeats. In UTC the first pass of that local hour occupies
      // [tr.at - gapMs, tr.at); the second pass occupies [tr.at, tr.at + gapMs).
      // A cron firing whose UTC instant lands in the first pass is ambiguous and
      // most schedulers will fire it again gapMs later → double_fire.
      const firstPassStart = tr.at - gapMs
      const firstPassEnd = tr.at
      for (const ms of firings) {
        if (ms >= firstPassStart && ms < firstPassEnd) {
          traps.push({
            type: 'ambiguous',
            atLocal: formatLocal(new Date(ms), timezone),
            atUtc: new Date(ms).toISOString(),
          })
          traps.push({
            type: 'double_fire',
            atLocal: formatLocal(new Date(ms), timezone),
            atUtc: new Date(ms + gapMs).toISOString(),
          })
        }
      }
    }
  }

  return traps
}

// ---------------------------------------------------------------------------
// coverageGaps
// ---------------------------------------------------------------------------

export function coverageGaps(
  windows: CoverageWindow[],
  jobs: Job[],
  opts: { horizonDays?: number } = {},
): CoverageGap[] {
  const horizonDays = opts.horizonDays ?? 7
  const now = floorToMinute(Date.now())
  const horizonEnd = now + horizonDays * DAY_MS

  // Collect all firing instants across jobs in the horizon (sorted unique).
  const allFirings: number[] = []
  for (const job of jobs) {
    for (const ms of firingsInHorizon(job, now, horizonDays)) allFirings.push(ms)
  }
  allFirings.sort((a, b) => a - b)

  const gaps: CoverageGap[] = []

  for (const w of windows) {
    if (!isValidIso(w.start) || !isValidIso(w.end)) continue
    const wStart = Math.max(new Date(w.start).getTime(), now)
    const wEnd = Math.min(new Date(w.end).getTime(), horizonEnd)
    if (wEnd <= wStart) continue

    // Firings that fall inside this window, plus the window edges.
    const inside = allFirings.filter((ms) => ms >= wStart && ms <= wEnd)
    const points = [wStart, ...inside, wEnd]

    // The largest interval with no firing is the coverage gap.
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i]
      const b = points[i + 1]
      const gapMs = b - a
      // Only report meaningful gaps (> 0). If there are zero firings inside,
      // the entire window is one gap.
      if (gapMs > 0 && (inside.length === 0 || gapMs > MINUTE_MS)) {
        gaps.push({
          windowStart: new Date(a).toISOString(),
          windowEnd: new Date(b).toISOString(),
          durationMinutes: Math.round(gapMs / MINUTE_MS),
        })
      }
    }
  }

  // Merge nothing; return ordered by start.
  return gaps.sort((a, b) => new Date(a.windowStart).getTime() - new Date(b.windowStart).getTime())
}

// ---------------------------------------------------------------------------
// autoSpread
// ---------------------------------------------------------------------------

export function autoSpread(jobs: Job[], opts: { threshold?: number; horizonDays?: number } = {}): SpreadSuggestion[] {
  const threshold = Math.max(2, opts.threshold ?? 2)
  const collisions = computeCollisions(jobs, { horizonDays: opts.horizonDays ?? 7, threshold })
  if (collisions.length === 0) return []

  // Count how many collisions each job participates in.
  const offenderCount = new Map<string, number>()
  for (const col of collisions) {
    for (const id of col.jobIds) {
      offenderCount.set(id, (offenderCount.get(id) ?? 0) + 1)
    }
  }

  const jobById = new Map(jobs.map((j) => [j.id, j]))
  const suggestions: SpreadSuggestion[] = []
  const seen = new Set<string>()

  // For each collision, keep the first job as-is and suggest spreading the rest
  // by staggering their start minute. This is deterministic: offset = index.
  for (const col of collisions) {
    col.jobIds.forEach((id, idx) => {
      if (idx === 0) return // anchor stays
      if (seen.has(id)) return
      const job = jobById.get(id)
      if (!job) return
      const suggested = staggerExpression(job, idx)
      if (!suggested) return
      seen.add(id)
      suggestions.push({
        jobId: id,
        suggestedExpr: suggested,
        reason:
          col.resourceId !== undefined
            ? `Shares resource "${col.resourceId}" with ${col.jobIds.length - 1} other job(s) at ${col.windowStart}; stagger to avoid contention`
            : `Concurrent with ${col.jobIds.length - 1} other job(s) at ${col.windowStart}; stagger to reduce load`,
      })
    })
  }

  return suggestions
}

// Produce a staggered variant of an expression by shifting its minute field
// (cron) or nudging the start (rate/oneoff) by `offsetMinutes`.
function staggerExpression(job: Job, offsetMinutes: number): string | null {
  const shift = ((offsetMinutes * 7) % 59) + 1 // deterministic, spread within the hour

  if (job.kind === 'cron') {
    const fields = job.expr.trim().split(/\s+/)
    if (fields.length < 5) return null
    const min = fields[0]
    // Only handle a fixed numeric minute; leave step/list expressions alone.
    if (/^\d+$/.test(min)) {
      const newMin = (parseInt(min, 10) + shift) % 60
      fields[0] = String(newMin)
      return fields.join(' ')
    }
    if (min.startsWith('*/')) {
      // Convert "*/N" into an offset start: "S-59/N" is non-standard; instead
      // suggest a fixed offset minute to break the on-the-hour pile-up.
      return [String(shift), ...fields.slice(1)].join(' ')
    }
    return null
  }

  if (job.kind === 'rate') {
    // Rate jobs cannot encode a phase offset in the expression itself; keep the
    // cadence but document the recommended stagger.
    return `${job.expr} (offset +${shift}m)`
  }

  if (job.kind === 'oneoff') {
    if (!isValidIso(job.expr)) return null
    const shifted = new Date(new Date(job.expr).getTime() + shift * MINUTE_MS)
    return shifted.toISOString()
  }

  return null
}
