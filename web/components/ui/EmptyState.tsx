import type { ReactNode } from 'react'

interface EmptyStateProps {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
}

export function EmptyState({ title, description, icon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-800 bg-stone-900/30 px-6 py-14 text-center">
      {icon && <div className="mb-3 text-3xl text-stone-600">{icon}</div>}
      <h3 className="text-base font-semibold text-stone-200">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-stone-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export default EmptyState
