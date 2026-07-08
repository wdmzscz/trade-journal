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
        value > 0 && 'bg-emerald-50 text-emerald-700',
        value < 0 && 'bg-red-50 text-red-600',
        value === 0 && 'bg-slate-100 text-slate-600',
        className
      )}
    >
      {formatCurrency(value)}
    </span>
  )
}
