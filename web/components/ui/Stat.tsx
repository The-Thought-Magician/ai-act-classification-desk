import type { ReactNode } from 'react'

interface StatProps {
  label: string
  value: ReactNode
  hint?: ReactNode
  accent?: 'indigo' | 'amber' | 'green' | 'red' | 'slate'
}

const accents = {
  indigo: 'text-rose-300',
  amber: 'text-amber-300',
  green: 'text-green-300',
  red: 'text-red-300',
  slate: 'text-stone-100',
}

export function Stat({ label, value, hint, accent = 'slate' }: StatProps) {
  return (
    <div className="rounded-xl border border-stone-800 bg-stone-900/60 px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</div>
      <div className={`mt-2 text-3xl font-bold ${accents[accent]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-stone-400">{hint}</div>}
    </div>
  )
}

export default Stat
