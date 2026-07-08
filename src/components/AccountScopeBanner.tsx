import { useTradeStore } from '../hooks/useTradeStore'
import { formatCurrency } from '../utils/stats'
import { cn } from '../utils/cn'

export function AccountScopeBanner({ className }: { className?: string }) {
  const { selectedAccount, selectedAccountInfo, filteredTrades } = useTradeStore()

  const closed = filteredTrades.filter((t) => t.status === 'closed')
  const totalPnl = closed.reduce((sum, t) => sum + t.pnl, 0)

  if (selectedAccount === 'all') {
    return (
      <div className={cn('rounded-xl border border-brand-200 bg-brand-50 px-4 py-3', className)}>
        <p className="text-sm text-brand-900">
          <span className="font-semibold">全部账户汇总</span>
          <span className="mx-2 text-brand-300">|</span>
          {filteredTrades.length} 笔交易
          <span className="mx-2 text-brand-300">|</span>
          总盈亏 <span className={cn('font-semibold', totalPnl >= 0 ? 'text-emerald-700' : 'text-red-600')}>{formatCurrency(totalPnl)}</span>
        </p>
      </div>
    )
  }

  const label = selectedAccountInfo?.label ?? selectedAccount

  if (filteredTrades.length === 0) {
    return (
      <div className={cn('rounded-xl border border-amber-200 bg-amber-50 px-4 py-3', className)}>
        <p className="text-sm text-amber-900">
          <span className="font-semibold">{label}</span>
          <span className="mx-2 text-amber-300">|</span>
          该账户暂无交易数据，请前往 Import CSV 导入账单
        </p>
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm', className)}>
      <p className="text-sm text-slate-700">
        <span className="font-semibold text-slate-900">{label}</span>
        {label !== selectedAccount && (
          <span className="ml-2 text-slate-400">({selectedAccount})</span>
        )}
        <span className="mx-2 text-slate-200">|</span>
        {filteredTrades.length} 笔交易
        {selectedAccountInfo?.currentCapital != null && selectedAccountInfo.currentCapital > 0 && (
          <>
            <span className="mx-2 text-slate-200">|</span>
            本金 <span className="font-semibold text-slate-900">{formatCurrency(selectedAccountInfo.currentCapital)}</span>
          </>
        )}
        <span className="mx-2 text-slate-200">|</span>
        盈亏 <span className={cn('font-semibold', totalPnl >= 0 ? 'text-emerald-600' : 'text-red-500')}>{formatCurrency(totalPnl)}</span>
      </p>
    </div>
  )
}
