'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import api from '@/lib/api'
import { Card, CardHeader, CardBody } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageSpinner } from '@/components/ui/Spinner'
import { Stat } from '@/components/ui/Stat'

type Notification = {
  id: string
  type?: string
  title?: string
  body?: string
  entity_type?: string | null
  entity_id?: string | null
  read?: boolean
  created_at?: string
}

// Maps a notification type to a tone + glyph for visual scanning.
const TYPE_META: Record<string, { tone: 'indigo' | 'amber' | 'green' | 'red' | 'slate' | 'blue'; icon: string }> = {
  classification: { tone: 'indigo', icon: '◈' },
  role_flip: { tone: 'amber', icon: '⇄' },
  role_change: { tone: 'amber', icon: '⇄' },
  deadline: { tone: 'red', icon: '⏰' },
  obligation: { tone: 'amber', icon: '§' },
  evidence: { tone: 'green', icon: '✓' },
  registry: { tone: 'blue', icon: '⌗' },
  notice: { tone: 'blue', icon: '¶' },
}

function metaFor(type?: string) {
  return TYPE_META[(type ?? '').toLowerCase()] ?? { tone: 'slate' as const, icon: '•' }
}

// Best-effort link to the entity a notification refers to.
function hrefFor(n: Notification): string | null {
  const t = (n.entity_type ?? '').toLowerCase()
  if (!n.entity_id) {
    if (t === 'deadline') return '/dashboard/deadlines'
    return null
  }
  if (t.startsWith('system') || t === 'ai_system') return `/dashboard/systems/${n.entity_id}`
  if (t.startsWith('oblig')) return '/dashboard/obligations'
  if (t.startsWith('evidence')) return '/dashboard/evidence'
  if (t.startsWith('notice') || t.startsWith('transparency')) return '/dashboard/notices'
  if (t.startsWith('registry')) return '/dashboard/registry'
  return null
}

function formatTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'unread'>('all')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await api.listNotifications()
      const list: Notification[] = Array.isArray(res?.notifications)
        ? res.notifications
        : Array.isArray(res)
          ? res
          : []
      setNotifications(list)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notifications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.read).length,
    [notifications],
  )

  const visible = useMemo(
    () => (tab === 'unread' ? notifications.filter((n) => !n.read) : notifications),
    [notifications, tab],
  )

  async function markRead(id: string) {
    setBusyId(id)
    // Optimistic update.
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    try {
      await api.markNotificationRead(id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark as read')
      // Revert on failure.
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: false } : n)))
    } finally {
      setBusyId(null)
    }
  }

  async function markAll() {
    if (unreadCount === 0) return
    setMarkingAll(true)
    const snapshot = notifications
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
    try {
      await api.markAllNotificationsRead()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to mark all as read')
      setNotifications(snapshot)
    } finally {
      setMarkingAll(false)
    }
  }

  if (loading) return <PageSpinner label="Loading notifications…" />

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-100">Notifications</h1>
          <p className="mt-1 text-sm text-stone-400">
            Classification changes, role flips, deadlines, and compliance events.
          </p>
        </div>
        <Button variant="secondary" onClick={markAll} disabled={markingAll || unreadCount === 0}>
          {markingAll ? 'Marking…' : 'Mark all as read'}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total" value={notifications.length} accent="indigo" />
        <Stat label="Unread" value={unreadCount} accent={unreadCount > 0 ? 'amber' : 'slate'} />
        <Stat
          label="Read"
          value={notifications.length - unreadCount}
          accent="green"
        />
      </div>

      {error && (
        <div className="flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          <span>{error}</span>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      )}

      <Card>
        <CardHeader className="flex items-center gap-2">
          <button
            onClick={() => setTab('all')}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              tab === 'all' ? 'bg-rose-500/15 text-rose-200' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setTab('unread')}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              tab === 'unread' ? 'bg-rose-500/15 text-rose-200' : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Unread {unreadCount > 0 && <span className="ml-1 text-amber-300">({unreadCount})</span>}
          </button>
        </CardHeader>
        <CardBody className="p-0">
          {visible.length === 0 ? (
            <div className="px-5 py-10">
              <EmptyState
                icon={<span>🔔</span>}
                title={tab === 'unread' ? 'No unread notifications' : 'No notifications'}
                description={
                  tab === 'unread'
                    ? 'You are all caught up.'
                    : 'Compliance events will appear here as your systems are classified and updated.'
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-stone-800">
              {visible.map((n) => {
                const meta = metaFor(n.type)
                const href = hrefFor(n)
                const inner = (
                  <div
                    className={`flex items-start gap-4 px-5 py-4 transition-colors ${
                      n.read ? 'bg-transparent' : 'bg-rose-500/[0.04]'
                    } ${href ? 'hover:bg-stone-900/60' : ''}`}
                  >
                    {!n.read && (
                      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-rose-400" aria-label="unread" />
                    )}
                    {n.read && <span className="mt-2 h-2 w-2 shrink-0" />}
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-700 bg-stone-950/60 text-rose-300">
                      {meta.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-medium ${n.read ? 'text-stone-300' : 'text-stone-100'}`}>
                          {n.title || 'Notification'}
                        </span>
                        {n.type && <Badge tone={meta.tone}>{n.type.replace(/_/g, ' ')}</Badge>}
                      </div>
                      {n.body && <p className="mt-1 text-sm text-stone-400">{n.body}</p>}
                      <p className="mt-1 text-xs text-stone-500">{formatTime(n.created_at)}</p>
                    </div>
                    {!n.read && (
                      <button
                        onClick={(e) => {
                          e.preventDefault()
                          markRead(n.id)
                        }}
                        disabled={busyId === n.id}
                        className="shrink-0 rounded-lg border border-stone-700 px-2.5 py-1 text-xs text-stone-300 hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-50"
                      >
                        {busyId === n.id ? '…' : 'Mark read'}
                      </button>
                    )}
                  </div>
                )
                return (
                  <li key={n.id}>
                    {href ? (
                      <Link href={href} className="block">{inner}</Link>
                    ) : (
                      inner
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  )
}
