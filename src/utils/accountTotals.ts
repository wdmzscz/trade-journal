import type { AccountInfo, AccountProfile, AccountScope, AccountType, Trade } from '../types'
import {
  computeAccountReturn,
  resolvePrincipalCapital,
  resolveStartingCapital,
} from './stats'

export function closedTradePnl(trades: Pick<Trade, 'status' | 'pnl'>[]): number {
  return trades.reduce((sum, trade) => (trade.status === 'closed' ? sum + trade.pnl : sum), 0)
}

type AccountMoney = Pick<
  AccountInfo,
  'totalPnl' | 'principalCapital' | 'startingCapital' | 'currentCapital' | 'totalDeposits'
>

/** Paper：本金 + 已平仓案例/交易盈亏。不用存下来的净资产。 */
function paperAccountMoney(
  profile: AccountProfile | undefined,
  accountTrades: Trade[],
): AccountMoney {
  const totalPnl = closedTradePnl(accountTrades)
  const principalCapital = resolvePrincipalCapital(
    profile?.startingCapital ?? 0,
    profile?.totalDeposits
  )

  return {
    totalPnl,
    principalCapital,
    startingCapital: principalCapital > 0 ? principalCapital : profile?.startingCapital,
    currentCapital: principalCapital > 0 ? principalCapital + totalPnl : undefined,
    totalDeposits: profile?.totalDeposits ?? (principalCapital > 0 ? principalCapital : undefined),
  }
}

/** 实盘：净资产和入金直接读券商数据；盈亏只在缺数时才用交易合计兜底。 */
function liveAccountMoney(
  profile: AccountProfile | undefined,
  accountTrades: Trade[],
): AccountMoney {
  const startingCapital = resolveStartingCapital(
    profile?.startingCapital ?? 0,
    profile?.totalDeposits
  )
  const principalCapital = resolvePrincipalCapital(
    profile?.startingCapital ?? 0,
    profile?.totalDeposits
  )
  const currentCapital =
    profile?.currentCapital != null && profile.currentCapital > 0
      ? profile.currentCapital
      : undefined
  const accountReturn = computeAccountReturn(
    profile?.startingCapital,
    profile?.currentCapital,
    profile?.totalDeposits
  )

  return {
    totalPnl: accountReturn ?? closedTradePnl(accountTrades),
    principalCapital,
    startingCapital: startingCapital > 0 ? startingCapital : profile?.startingCapital,
    currentCapital,
    totalDeposits: profile?.totalDeposits,
  }
}

export function buildAccountInfo(
  id: string,
  trades: Trade[],
  profile: AccountProfile | undefined,
  inferType: (accountTrades: Trade[]) => AccountType,
): AccountInfo {
  const accountTrades = trades.filter((trade) => trade.account === id)
  const money = profile?.isPaper
    ? paperAccountMoney(profile, accountTrades)
    : liveAccountMoney(profile, accountTrades)

  return {
    id,
    label: profile?.label ?? id,
    type: profile?.type ?? inferType(accountTrades),
    isPaper: Boolean(profile?.isPaper),
    tradeCount: accountTrades.length,
    ...money,
  }
}

export function toAccountScope(account: AccountInfo): AccountScope {
  return {
    id: account.id,
    label: account.label,
    isAll: false,
    isPaper: Boolean(account.isPaper),
    tradeCount: account.tradeCount,
    totalPnl: account.totalPnl,
    principalCapital: account.principalCapital,
    startingCapital: account.startingCapital,
    currentCapital: account.currentCapital,
    totalDeposits: account.totalDeposits,
  }
}

export function sumAccountScope(
  items: AccountInfo[],
  meta: Pick<AccountScope, 'id' | 'label' | 'isAll' | 'isPaper'>,
): AccountScope {
  const hasEquity = items.some((item) => item.currentCapital != null)
  return {
    ...meta,
    tradeCount: items.reduce((sum, item) => sum + item.tradeCount, 0),
    totalPnl: items.reduce((sum, item) => sum + item.totalPnl, 0),
    principalCapital: items.reduce((sum, item) => sum + item.principalCapital, 0),
    startingCapital: items.reduce((sum, item) => sum + (item.startingCapital ?? 0), 0) || undefined,
    currentCapital: hasEquity
      ? items.reduce((sum, item) => sum + (item.currentCapital ?? 0), 0)
      : undefined,
    totalDeposits: items.reduce((sum, item) => sum + (item.totalDeposits ?? 0), 0) || undefined,
  }
}
