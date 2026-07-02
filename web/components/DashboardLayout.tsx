'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { authClient } from '@/lib/auth/client'
import ContextRail from '@/components/ContextRail'

// Pages that get the persistent right-rail (audit snapshot, recent
// classifications, upcoming deadlines) alongside the left nav.
const RAIL_PATHS = new Set(['/dashboard', '/dashboard/systems'])

type NavItem = { label: string; href: string }
type NavSection = { title: string; items: NavItem[] }

const SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Analytics', href: '/dashboard/analytics' },
    ],
  },
  {
    title: 'Systems',
    items: [
      { label: 'AI Systems', href: '/dashboard/systems' },
      { label: 'New System', href: '/dashboard/systems/new' },
      { label: 'Search', href: '/dashboard/search' },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { label: 'Obligations', href: '/dashboard/obligations' },
      { label: 'Evidence', href: '/dashboard/evidence' },
      { label: 'Transparency Notices', href: '/dashboard/notices' },
      { label: 'Registry Packages', href: '/dashboard/registry' },
      { label: 'Role Changes', href: '/dashboard/roles' },
      { label: 'Deadlines', href: '/dashboard/deadlines' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { label: 'Tags & Filters', href: '/dashboard/tags' },
      { label: 'Notifications', href: '/dashboard/notifications' },
      { label: 'Audit Log', href: '/dashboard/audit' },
    ],
  },
  {
    title: 'Developer',
    items: [
      { label: 'Webhooks', href: '/dashboard/webhooks' },
      { label: 'API Keys', href: '/dashboard/api-keys' },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Onboarding', href: '/dashboard/onboarding' },
      { label: 'Settings', href: '/dashboard/settings' },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard'
  // Avoid /dashboard/systems matching /dashboard/systems/new while still
  // matching detail routes; "New System" and "AI Systems" both live under
  // /dashboard/systems, so exact-match the explicit nav targets.
  if (href === '/dashboard/systems') return pathname === '/dashboard/systems'
  return pathname === href || pathname.startsWith(href + '/')
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    let active = true
    authClient.getSession().then((s) => {
      if (!active) return
      if (!s?.data?.user) {
        router.push('/auth/sign-in')
        return
      }
      setReady(true)
    }).catch(() => {
      if (active) router.push('/auth/sign-in')
    })
    return () => { active = false }
  }, [router])

  // Close mobile drawer on navigation.
  useEffect(() => { setOpen(false) }, [pathname])

  const signOut = async () => {
    await authClient.signOut()
    router.push('/')
  }

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-950">
        <div className="flex items-center gap-3 text-stone-400">
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-700 border-t-rose-400" />
          Loading workspace...
        </div>
      </div>
    )
  }

  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 text-sm font-black text-white">AI</span>
          <span className="text-sm font-bold leading-tight text-white">
            AiActClassification<span className="text-rose-400">Desk</span>
          </span>
        </Link>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 pb-6">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-600">{section.title}</div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(pathname, item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                      active
                        ? 'bg-rose-500/15 font-medium text-rose-300'
                        : 'text-stone-400 hover:bg-stone-800/60 hover:text-stone-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </nav>
  )

  return (
    <div className="min-h-screen bg-stone-950">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-stone-800 bg-stone-900/40 lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-stone-950/70" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-stone-800 bg-stone-900">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-800 bg-stone-950/80 px-4 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-stone-400 hover:bg-stone-800 hover:text-white lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
            <span className="text-sm font-medium text-stone-300">Compliance Workspace</span>
          </div>
          <button
            onClick={signOut}
            className="rounded-lg border border-stone-700 bg-stone-800 px-3 py-1.5 text-sm text-stone-200 transition-colors hover:bg-stone-700"
          >
            Sign out
          </button>
        </header>

        <main className="px-4 py-6 lg:px-8 lg:py-8">
          {RAIL_PATHS.has(pathname) ? (
            <div className="flex gap-6">
              <div className="min-w-0 flex-1">{children}</div>
              <ContextRail />
            </div>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  )
}
