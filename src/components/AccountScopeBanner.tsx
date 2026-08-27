import { useTradeStore } from '../hooks/useTradeStore'
import { formatCurrency, resolvePrincipalCapital } from '../utils/stats'
import { cn } from '../utils/cn'

export function AccountScopeBanner({ className }: { className?: string }) {
  const { filteredTrades, selectedAccount, selectedAccountInfo, accountInfos, accountProfiles, setSelectedAccount } = useTradeStore()

  const closed = filteredTrades.filter((t) => t.status === 'closed')
  const tradePnl = closed.reduce((sum, t) => sum + t.pnl, 0)

  const selectedProfile = selectedAccount === 'all'
    ? null
    : accountProfiles.find((p) => p.id === selectedAccount)

  const principalCapital = selectedProfile
    ? resolvePrincipalCapital(selectedProfile.startingCapital ?? 0, selectedProfile.totalDeposits)
    : accountProfiles
        .filter((profile) => !profile.isPaper)
        .reduce(
          (sum, profile) =>
            sum + resolvePrincipalCapital(profile.startingCapital ?? 0, profile.totalDeposits),
          0
        )

  const otherAccountsWithData = accountInfos.filter(
    (a) => a.id !== selectedAccount && a.tradeCount > 0
  )

  if (selectedAccount === 'all') {
    return (
      <div
        className={cn(
          'rounded-xl border border-brand-200 bg-brand-50 px-4 py-3',
          'dark:border-brand-700 dark:bg-surface-800',
          className
        )}
      >
        <p className="text-sm text-brand-900 dark:text-slate-100">
          <span className="font-semibold">全部账户汇总</span>
          <span className="ml-1 text-xs font-normal text-brand-600/80 dark:text-slate-400">（不含 Paper）</span>
          <span className="mx-2 text-brand-300 dark:text-slate-500">|</span>
          {filteredTrades.length} 笔交易
          {principalCapital > 0 && (
            <>
              <span className="mx-2 text-brand-300 dark:text-slate-500">|</span>
              累计入金 <span className="font-semibold">{formatCurrency(principalCapital)}</span>
            </>
          )}
          <span className="mx-2 text-brand-300 dark:text-slate-500">|</span>
          总盈亏{' '}
          <span
            className={cn(
              'font-semibold',
              tradePnl >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
            )}
          >
            {formatCurrency(tradePnl)}
          </span>
        </p>
      </div>
    )
  }

  const label = selectedAccountInfo?.label ?? selectedAccount
  const isPaper = Boolean(selectedAccountInfo?.isPaper)

  if (filteredTrades.length === 0) {
    return (
      <div className={cn('rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30', className)}>
        <p className="text-sm text-amber-900 dark:text-amber-100">
          <span className="font-semibold">{label}</span>
          {isPaper && <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:bg-violet-950 dark:text-violet-300">Paper</span>}
          <span className="mx-2 text-amber-300 dark:text-amber-700">|</span>
          该账户暂无交易数据
        </p>
        {otherAccountsWithData.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedAccount('all')}
              className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-brand-700 shadow-sm hover:bg-brand-50 dark:bg-surface-900 dark:text-brand-300 dark:hover:bg-surface-800"
            >
              查看全部账户（{accountInfos.reduce((s, a) => s + a.tradeCount, 0)} 笔）
            </button>
            {otherAccountsWithData.map((account) => (
              <button
                key={account.id}
                type="button"
                onClick={() => setSelectedAccount(account.id)}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50 dark:bg-surface-900 dark:text-slate-200 dark:hover:bg-surface-800"
              >
                切换到 {account.label}（{account.tradeCount} 笔）
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={cn('rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-surface-700 dark:bg-surface-900', className)}>
      <p className="text-sm text-slate-700 dark:text-slate-300">
        <span className="font-semibold text-slate-900 dark:text-slate-100">{label}</span>
        {isPaper && (
          <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            Paper
          </span>
        )}
        {label !== selectedAccount && (
          <span className="ml-2 text-slate-400">({selectedAccount})</span>
        )}
        <span className="mx-2 text-slate-200 dark:text-surface-700">|</span>
        {filteredTrades.length} 笔交易
        {principalCapital > 0 && (
          <>
            <span className="mx-2 text-slate-200 dark:text-surface-700">|</span>
            累计入金 <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(principalCapital)}</span>
          </>
        )}
        {selectedAccountInfo?.currentCapital != null && selectedAccountInfo.currentCapital > 0 && (
          <>
            <span className="mx-2 text-slate-200 dark:text-surface-700">|</span>
            净资产 <span className="font-semibold text-slate-900 dark:text-slate-100">{formatCurrency(selectedAccountInfo.currentCapital)}</span>
          </>
        )}
        <span className="mx-2 text-slate-200 dark:text-surface-700">|</span>
        总盈亏 <span className={cn('font-semibold', tradePnl >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400')}>{formatCurrency(tradePnl)}</span>
      </p>
    </div>
  )
}
