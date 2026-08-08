import { cn } from '../utils/cn'
import { formatCurrency } from '../utils/stats'

interface PnlBadgeProps {
  value: number
  className?: string
}

export function PnlBadge({ value, className }: PnlBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex rounded-md px-2 py-0.5 text-sm font-semibold',
        value > 0 && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
        value < 0 && 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400',
        value === 0 && 'bg-slate-100 text-slate-600 dark:bg-surface-800 dark:text-slate-300',
        className
      )}
    >
      {formatCurrency(value)}
    </span>
  )
}
