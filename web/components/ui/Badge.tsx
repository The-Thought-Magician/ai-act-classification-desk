import type { HTMLAttributes } from 'react'

type Tone = 'indigo' | 'amber' | 'green' | 'red' | 'slate' | 'blue'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  indigo: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  green: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  red: 'bg-red-500/15 text-red-300 border-red-500/30',
  slate: 'bg-slate-500/15 text-slate-300 border-slate-500/30',
  blue: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
}

// Maps an EU AI Act risk tier to a tone for consistent coloring.
export function tierTone(tier?: string): Tone {
  switch ((tier ?? '').toLowerCase()) {
    case 'prohibited': return 'red'
    case 'high': return 'amber'
    case 'limited': return 'blue'
    case 'minimal': return 'green'
    default: return 'slate'
  }
}

// Maps a generic status string to a tone.
export function statusTone(status?: string): Tone {
  switch ((status ?? '').toLowerCase()) {
    case 'complete':
    case 'approved':
    case 'registered':
    case 'submitted':
    case 'ready':
    case 'published': return 'green'
    case 'in-progress':
    case 'in-review':
    case 'under-review':
    case 'draft': return 'amber'
    case 'blocked':
    case 'overdue':
    case 'missing': return 'red'
    case 'not-applicable': return 'slate'
    default: return 'indigo'
  }
}

export function Badge({ tone = 'slate', className = '', children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </span>
  )
}

export default Badge
