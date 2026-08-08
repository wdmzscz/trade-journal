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
    <div className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
          <p
            className={cn(
              'mt-1 text-2xl font-bold tracking-tight',
              trend === 'up' && 'text-emerald-600 dark:text-emerald-400',
              trend === 'down' && 'text-red-500 dark:text-red-400',
              trend === 'neutral' && 'text-slate-900 dark:text-slate-100'
            )}
          >
            {value}
          </p>
          {subtitle && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{subtitle}</p>}
        </div>
        {icon && (
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600 dark:bg-brand-950/50 dark:text-brand-400">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
