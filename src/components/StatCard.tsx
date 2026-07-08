import { type ReactNode } from 'react'
import { cn } from '../utils/cn'

interface StatCardProps {
  title: string
  value: string
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: ReactNode
}

export function StatCard({ title, value, subtitle, trend, icon }: StatCardProps) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold tracking-tight',
              trend === 'up' && 'text-emerald-600',
              trend === 'down' && 'text-red-500',
              trend === 'neutral' && 'text-slate-900'
            )}
          >
            {value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
        </div>
        {icon && <div className="rounded-lg bg-brand-50 p-2 text-brand-600">{icon}</div>}
      </div>
    </div>
  )
}
