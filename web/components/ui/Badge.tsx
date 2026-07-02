import type { HTMLAttributes } from 'react'

type Tone = 'indigo' | 'amber' | 'green' | 'red' | 'slate' | 'blue'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const tones: Record<Tone, string> = {
  indigo: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  green: 'bg-green-500/15 text-green-300 border-green-500/30',
  red: 'bg-red-500/15 text-red-300 border-red-500/30',
  slate: 'bg-stone-500/15 text-stone-300 border-stone-500/30',
  blue: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
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
